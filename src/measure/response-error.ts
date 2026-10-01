// Longest part of an error answer that goes into the error message, so a
// large error page does not fill the logs.
const MAX_ERROR_TEXT_LENGTH = 200

// The error for an answer that is not ok: the service, the status and the
// start of the answer.
export async function createResponseError(service: string, response: Response) {
  const text = await response.text()
  const start =
    text.length > MAX_ERROR_TEXT_LENGTH
      ? `${text.slice(0, MAX_ERROR_TEXT_LENGTH)}…`
      : text
  return new Error(`${service} answered ${response.status}: ${start}`)
}
