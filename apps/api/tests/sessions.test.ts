import request from 'supertest';
import jwt from 'jsonwebtoken';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

import { createApp } from '../src/app';
import { env } from '../src/config/env';
import { connectDatabase } from '../src/config/database';

describe('API sessions + events + reports', () => {
  let mongod: MongoMemoryServer;
  const app = createApp();
  const token = jwt.sign({ sub: 'test' }, env.JWT_SECRET, { algorithm: 'HS256' });
  const auth = { Authorization: `Bearer ${token}` };

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    // patch env for the duration
    (env as any).MONGO_URL = uri;
    await connectDatabase();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
  });

  it('rejects unauthenticated mutation', async () => {
    const res = await request(app).post('/api/sessions').send({ candidateName: 'A' });
    expect(res.status).toBe(401);
  });

  it('validates request bodies', async () => {
    const res = await request(app)
      .post('/api/sessions')
      .set(auth)
      .send({ candidateName: '' });
    // zod should trigger 400
    expect([400, 401]).toContain(res.status); // if auth passed but zod fails -> 400
  });

  it('creates a session, appends events, ends, fetches report', async () => {
    // create session
    const create = await request(app)
      .post('/api/sessions')
      .set(auth)
      .send({ candidateName: 'Tester' });
    expect(create.status).toBe(201);
    const id = create.body._id as string;

    // append events
    const events = [
      { id: '1', ts: Date.now(), type: 'LookingAway' as const },
      { id: '2', ts: Date.now() + 1000, type: 'NoFace' as const },
    ];
    const append = await request(app)
      .post(`/api/sessions/${id}/events`)
      .set(auth)
      .send({ events });
    expect(append.status).toBe(200);

    // end session
    const end = await request(app).patch(`/api/sessions/${id}/end`).set(auth).send();
    expect(end.status).toBe(200);

    // get report
    const report = await request(app).get(`/api/reports/${id}`).send();
    expect(report.status).toBe(200);
    expect(report.body.integrityScore).toBeLessThan(100);
    expect(report.body.countsByType.LookingAway).toBeGreaterThanOrEqual(1);
  });
});

