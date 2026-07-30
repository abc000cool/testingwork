import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <section className="panel narrow">
      <h1>Not found</h1>
      <p className="muted">
        That page doesn&rsquo;t exist. <Link to="/">Go home</Link>
      </p>
    </section>
  )
}
