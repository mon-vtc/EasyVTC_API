// Wrapper Supertest : évite de répéter l'import de l'app et le header Authorization.

import request from 'supertest';
import app from '../../../src/app.js';

function bearer(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export function apiAs(token: string) {
  return {
    get:    (path: string) => request(app).get(path).set(bearer(token)),
    post:   (path: string) => request(app).post(path).set(bearer(token)),
    patch:  (path: string) => request(app).patch(path).set(bearer(token)),
    put:    (path: string) => request(app).put(path).set(bearer(token)),
    delete: (path: string) => request(app).delete(path).set(bearer(token)),
  };
}

export const api = {
  get:  (path: string) => request(app).get(path),
  post: (path: string) => request(app).post(path),
};
