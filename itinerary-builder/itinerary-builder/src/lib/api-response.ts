import { NextResponse } from 'next/server';

export type PaginationMeta = { total: number; page: number; limit: number; totalPages: number };

export function ok<T>(data: T, statusOrMeta: number | PaginationMeta = 200) {
  if (typeof statusOrMeta === 'number') {
    return NextResponse.json({ success: true, data }, { status: statusOrMeta });
  }
  return NextResponse.json({ success: true, data, pagination: statusOrMeta });
}

export function created<T>(data: T) {
  return ok(data, 201);
}

export function err(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ success: false, error: message, details }, { status });
}

export function unauthorized() {
  return err('Unauthorized', 401);
}

export function forbidden() {
  return err('Forbidden: insufficient permissions', 403);
}

export function notFound(resource = 'Resource') {
  return err(`${resource} not found`, 404);
}
