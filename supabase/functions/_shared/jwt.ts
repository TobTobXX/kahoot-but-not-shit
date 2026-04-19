import * as jose from "jsr:@panva/jose@6";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "./cors.ts";

const SUPABASE_JWT_ISSUER = Deno.env.get("SB_JWT_ISSUER") ??
	Deno.env.get("SUPABASE_URL") + "/auth/v1";

const SUPABASE_JWT_KEYS = jose.createRemoteJWKSet(
	new URL(Deno.env.get("SUPABASE_URL")! + "/auth/v1/.well-known/jwks.json"),
);

function getAuthToken(req: Request) {
	const authHeader = req.headers.get("authorization");
	if (!authHeader) {
		throw new Error("Missing Authorization header");
	}
	const [bearer, token] = authHeader.split(" ");
	if (bearer !== "Bearer") {
		throw new Error(`Authorization header is not 'Bearer <token>', got '${bearer}'`);
	}

	return token;
}

function verifySupabaseJWT(jwt: string) {
	return jose.jwtVerify(jwt, SUPABASE_JWT_KEYS, {
		issuer: SUPABASE_JWT_ISSUER,
	});
}

// Validates the authorization header, then calls next with the authenticated user's ID and email.
export async function AuthMiddleware(
	req: Request,
	next: (req: Request, userId: string, userEmail: string) => Promise<Response>,
) {
	try {
		const token = getAuthToken(req);

		try {
			await verifySupabaseJWT(token);
		} catch (e) {
			console.error("[auth] JWT verification failed:", e);
			return new Response("Unauthorized: invalid JWT", {
				status: 401,
				headers: corsHeaders,
			});
		}

		const supabaseUser = createClient(
			Deno.env.get("SUPABASE_URL")!,
			Deno.env.get("SUPABASE_ANON_KEY")!,
			{
				global: {
					headers: { Authorization: req.headers.get("Authorization")! },
				},
			},
		);
		const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
		if (userError || !user) {
			console.error("[auth] getUser() failed:", userError);
			return new Response("Unauthorized: could not resolve user from token", {
				status: 401,
				headers: corsHeaders,
			});
		}

		console.log(`[auth] authenticated user ${user.id} (${user.email})`);
		return await next(req, user.id, user.email ?? "");
	} catch (e) {
		console.error("[auth] unexpected error in AuthMiddleware:", e);
		return Response.json(
			{ msg: e?.toString() },
			{ status: 401 },
		);
	}
}
