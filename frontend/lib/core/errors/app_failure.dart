/// Application-level failure types.
///
/// Low-level exceptions (Dio, socket, cast errors...) are normalized into one
/// of these types before they reach Cubits/UI. Every message is user-safe:
/// raw technical exceptions or stack traces are never shown to users.
sealed class AppFailure {
  const AppFailure(this.message);

  /// A user-safe, human-readable description of the failure.
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
