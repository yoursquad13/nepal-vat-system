export class ApiError extends Error {
  statusCode: number;
  details?: any;

  constructor(statusCode: number, message: string, details?: any) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  static badRequest(message: string, details?: any): ApiError {
    return new ApiError(400, message, details);
  }

  static unauthorized(message = 'Authentication required', details?: any): ApiError {
    return new ApiError(401, message, details);
  }

  static forbidden(message = 'Forbidden', details?: any): ApiError {
    return new ApiError(403, message, details);
  }

  static notFound(message = 'Resource not found', details?: any): ApiError {
    return new ApiError(404, message, details);
  }

  static conflict(message: string, details?: any): ApiError {
    return new ApiError(409, message, details);
  }

  static internal(message = 'Internal server error', details?: any): ApiError {
    return new ApiError(500, message, details);
  }
}
