import { useSearchParams } from 'react-router-dom'
import HostLibrary from '../components/HostLibrary'
import HostSession from '../components/HostSession'

export default function Host() {
  const [searchParams] = useSearchParams()
  const sessionId = searchParams.get('sessionId')
  return sessionId ? <HostSession sessionId={sessionId} /> : <HostLibrary />
}
