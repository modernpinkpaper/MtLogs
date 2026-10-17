export class HubError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'HubError';
  }
}
/** Deliberately generic: identical for "does not exist" and "not allowed" so IDs cannot be probed. */
export class PermissionDenied extends HubError {
  constructor() {
    super('PERMISSION_DENIED', 'permission denied');
    this.name = 'PermissionDenied';
  }
}
