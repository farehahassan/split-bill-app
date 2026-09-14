/// Application-level failure types.
///
/// Low-level exceptions (Dio, socket, cast errors...) are normalized into one
/// of these types before they reach the UI. Every message is user-safe: raw
/// technical exceptions or stack traces are never shown to users.
sealed class AppFailure {
  const AppFailure(this.message);

  /// A user-safe, human-readable description of the failure.
  final String message;
}

/// A validation error for a specific request field, mirroring the backend's
/// `errors: [{ field, message }]` payload.
class ApiFieldError {
  const ApiFieldError({required this.field, required this.message});

  final String field;
  final String message;
}

class NetworkFailure extends AppFailure {
  const NetworkFailure([
    super.message =
        'Could not reach the server. Check your internet connection and try again.',
  ]);
}

class UnauthorizedFailure extends AppFailure {
  const UnauthorizedFailure([
    super.message = 'Your session has expired. Please sign in again.',
  ]);
}

class ValidationFailure extends AppFailure {
  const ValidationFailure([
    super.message = 'Please check the information you entered.',
  ]);
}

/// A bad request carrying the backend's structured field errors. Screens can
/// render a per-field message when present; the [message] is still user-safe.
class FieldValidationFailure extends ValidationFailure {
  const FieldValidationFailure([
    super.message = 'Please check the information you entered.',
    this.fieldErrors = const <ApiFieldError>[],
  ]);

  final List<ApiFieldError> fieldErrors;
}

class NotFoundFailure extends AppFailure {
  const NotFoundFailure([
    super.message = 'The requested item could not be found.',
  ]);
}

class ServerFailure extends AppFailure {
  const ServerFailure([
    super.message = 'Something went wrong on our side. Please try again later.',
  ]);
}

class UnknownFailure extends AppFailure {
  const UnknownFailure([
    super.message = 'Something went wrong. Please try again.',
  ]);
}

/// The backend address was reachable but reported it was not ready (503).
class ServiceUnavailableFailure extends ServerFailure {
  const ServiceUnavailableFailure([
    super.message = 'The service is temporarily unavailable. Please try again later.',
  ]);
}