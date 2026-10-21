// An error that is safe to show to the user. `code` lets the apps translate it.
export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code || 'error';
  }
}

export const bad = (message, code) => new HttpError(400, message, code);
export const forbidden = (message, code) => new HttpError(403, message, code || 'forbidden');
export const notFound = (message = 'Not found') => new HttpError(404, message, 'not_found');

// Wrap async route handlers so thrown errors reach the error middleware.
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function errorMiddleware(err, req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  if (err?.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: 'That value is already in use.', code: 'duplicate' });
  }
  if (err?.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'Photos must be 5 MB or smaller.', code: 'file_too_large' });
    return res.status(400).json({ error: 'The photo could not be received. Please try again.', code: 'upload_error' });
  }
  console.error('[hiraman] unexpected error:', err);
  res.status(500).json({ error: 'Something went wrong on the server.', code: 'server_error' });
}
