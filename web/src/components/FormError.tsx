import { fieldErrors, toMessage } from '../lib/http.ts'

/**
 * Renders a thrown API failure. On a VALIDATION_ERROR the backend sends
 * `details: [{path, message}]`, so show the per-field messages rather than
 * collapsing everything into one vague sentence.
 */
export function FormError({ error }: { error: unknown }) {
  if (error === null || error === undefined) return null

  const fields = fieldErrors(error)

  return (
    <div className="error" role="alert">
      <p>{toMessage(error)}</p>
      {fields.length > 0 && (
        <ul className="small field-errors">
          {fields.map((field, index) => (
            <li key={`${field.path}-${index}`}>
              <strong>{field.path}</strong>: {field.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
