import { useState, type FormEvent } from 'react'
import { ArrowRight, Compass, LoaderCircle } from 'lucide-react'
import { loginUser } from '../../services/firebase/authService'

const getLoginMessage = (error: unknown) => {
  if (error && typeof error === 'object' && 'code' in error && error.code === 'auth/invalid-credential') return 'El correo o la contraseña no son correctos.'
  return 'No pudimos iniciar sesión. Revisa tus datos e inténtalo de nuevo.'
}

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)
    try { await loginUser(email.trim(), password) } catch (loginError) { setError(getLoginMessage(loginError)) } finally { setIsSubmitting(false) }
  }

  return <main className="login-page"><section className="login-aside"><div className="brand brand-light"><span className="brand-mark"><Compass size={19} /></span><span>Pata y Perro</span></div><div className="login-intro"><span className="kicker">PMS para gente en movimiento</span><h1>Haz que cada llegada se sienta como volver a casa.</h1><p>Una recepción clara para cuidar huéspedes, camas y el ritmo del hostel.</p></div><div className="login-note">La operación de hoy, en un solo lugar.</div></section><section className="login-panel"><form className="login-form" onSubmit={handleSubmit}><span className="kicker">Área de recepción</span><h2>Bienvenido de vuelta</h2><p className="muted">Ingresa con tu cuenta autorizada.</p><label htmlFor="email">Correo electrónico<input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label htmlFor="password">Contraseña<input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>{error && <div className="form-error" role="alert">{error}</div>}<button className="primary-button" type="submit" disabled={isSubmitting}>{isSubmitting ? <LoaderCircle className="spin" size={18} /> : <ArrowRight size={18} />}{isSubmitting ? 'Ingresando...' : 'Entrar al PMS'}</button></form></section></main>
}
