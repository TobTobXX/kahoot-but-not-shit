import { byOrderIndex } from './utils'
import { processAndUploadImage } from './imageUpload'

async function imageUrlToBase64(url) {
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`Failed to fetch image: ${resp.status}`)
  const blob = await resp.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function base64ToBlob(dataUrl) {
  const [header, b64] = dataUrl.split(',')
  const mime = header.match(/:(.*?);/)[1]
  const binary = atob(b64)
  const arr = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

export async function exportQuiz(supabase, quizId) {
  console.log('[export] Fetching quiz metadata…')
  const { data: quiz, error: quizErr } = await supabase
    .from('quizzes')
    .select('title, is_public, language, topic')
    .eq('id', quizId)
    .single()
  if (quizErr) throw new Error(quizErr.message)

  const { data: questions, error: qErr } = await supabase
    .from('questions')
    .select('question_text, time_limit, points, image_url, order_index, answers(answer_text, is_correct, order_index)')
    .eq('quiz_id', quizId)
    .order('order_index')
  if (qErr) throw new Error(qErr.message)

  console.log(`[export] Exporting "${quiz.title}" — ${questions.length} question(s)`)

  const exportedQuestions = await Promise.all(
    questions.map(async (q, i) => {
      let image_data = null
      if (q.image_url) {
        console.log(`[export] Fetching image for question ${i + 1}/${questions.length}…`)
        try {
          image_data = await imageUrlToBase64(q.image_url)
          console.log(`[export] Image fetched for question ${i + 1}/${questions.length}`)
        } catch {
          console.warn(`[export] Failed to fetch image for question ${i + 1}/${questions.length}, skipping`)
        }
      }
      return {
        question_text: q.question_text,
        time_limit: q.time_limit,
        points: q.points,
        image_data,
        answers: [...q.answers].sort(byOrderIndex).map((a) => ({
          answer_text: a.answer_text,
          is_correct: a.is_correct,
        })),
      }
    })
  )

  console.log('[export] Done')
  return JSON.stringify(
    {
      version: 1,
      exported_at: new Date().toISOString(),
      title: quiz.title,
      is_public: quiz.is_public,
      language: quiz.language ?? null,
      topic: quiz.topic ?? null,
      questions: exportedQuestions,
    },
    null,
    2
  )
}

export async function importQuiz(supabase, userId, jsonString) {
  let data
  try {
    data = JSON.parse(jsonString)
  } catch {
    throw new Error('Invalid JSON file')
  }

  if (!data.title || !Array.isArray(data.questions)) {
    throw new Error('Invalid quiz file format')
  }

  console.log(`[import] Importing "${data.title}" — ${data.questions.length} question(s)`)

  const questions = await Promise.all(
    data.questions.map(async (q, i) => {
      let image_url = null
      if (q.image_data) {
        console.log(`[import] Uploading image for question ${i + 1}/${data.questions.length}…`)
        try {
          const questionId = crypto.randomUUID()
          const blob = base64ToBlob(q.image_data)
          image_url = await processAndUploadImage(supabase, blob, userId, questionId)
          console.log(`[import] Image uploaded for question ${i + 1}/${data.questions.length}`)
        } catch (err) {
          console.warn(`[import] Image upload error for question ${i + 1}/${data.questions.length}:`, err)
        }
      }
      return {
        order_index: i,
        question_text: q.question_text ?? '',
        time_limit: q.time_limit ?? 30,
        points: q.points ?? 1000,
        image_url,
        answers: (q.answers ?? []).map((a, ai) => ({
          order_index: ai,
          answer_text: a.answer_text ?? '',
          is_correct: a.is_correct ?? false,
        })),
      }
    })
  )

  console.log('[import] Saving quiz to database…')
  const { error } = await supabase.rpc('save_quiz', {
    p_title: data.title,
    p_is_public: data.is_public ?? false,
    p_language: data.language ?? null,
    p_topic: data.topic ?? null,
    p_questions: questions,
  })

  if (error) throw new Error(error.message)
  console.log('[import] Done')
}
