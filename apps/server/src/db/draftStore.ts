import type { PrismaClient, Prisma } from '@prisma/client';
import type { DraftRecord, DraftStore } from '../draft/store.js';
import { ConcurrencyError } from '../draft/store.js';
import type { DraftHistoryEntry, DraftState } from '../draft/types.js';
import type { Hero } from '../heroes.js';

const side = (t: 'amber' | 'sapphire'): 'AMBER' | 'SAPPHIRE' => (t === 'amber' ? 'AMBER' : 'SAPPHIRE');
type Row = { id: string; name: string; pugId: string | null; amberName: string; sapphireName: string; visibility: string; isSimulated: boolean; state: Prisma.JsonValue };
const toRecord = (r: Row): DraftRecord => ({
  id: r.id, name: r.name, pugId: r.pugId, teamNames: { amber: r.amberName, sapphire: r.sapphireName },
  visibility: r.visibility === 'private' ? 'private' : 'public', simulated: r.isSimulated, state: r.state as unknown as DraftState,
});

export class PrismaDraftStore implements DraftStore {
  constructor(private db: PrismaClient, private heroName: (id: number) => string, private createdBy: () => string | null = () => null) {}
  async get(id: string) { const r = await this.db.draftRoom.findUnique({ where: { id } }); return r ? toRecord(r) : null; }
  async create(rec: DraftRecord) {
    await this.db.draftRoom.create({ data: {
      id: rec.id, name: rec.name, pugId: rec.pugId, amberName: rec.teamNames.amber, sapphireName: rec.teamNames.sapphire,
      visibility: rec.visibility, isSimulated: rec.simulated, config: rec.state.config as unknown as Prisma.InputJsonValue,
      state: rec.state as unknown as Prisma.InputJsonValue, seq: rec.state.seq, status: rec.state.status, createdById: this.createdBy(),
    } });
  }
  async save(id: string, prevSeq: number, state: DraftState, newHistory: DraftHistoryEntry[]) {
    await this.db.$transaction(async (tx) => {
      const u = await tx.draftRoom.updateMany({ where: { id, seq: prevSeq }, data: {
        state: state as unknown as Prisma.InputJsonValue, seq: state.seq, status: state.status,
        completedAt: state.completedAt ? new Date(state.completedAt) : null,
      } });
      if (u.count !== 1) throw new ConcurrencyError('Draft was modified concurrently');
      for (const h of newHistory) {
        await tx.draftAction.create({ data: { draftId: id, seq: h.seq, step: h.step, team: side(h.team), kind: h.type === 'pick' ? 'PICK' : 'BAN', heroId: h.heroId, actorId: h.actorId, reason: h.reason } });
      }
      if (state.status === 'completed') {
        await tx.draftSelection.deleteMany({ where: { draftId: id } });
        await tx.draftBan.deleteMany({ where: { draftId: id } });
        for (const t of ['amber', 'sapphire'] as const) {
          await tx.draftSelection.createMany({ data: state.picks[t].map((heroId, order) => ({ draftId: id, team: side(t), order, heroId, heroNameSnapshot: this.heroName(heroId) })) });
          await tx.draftBan.createMany({ data: state.bans[t].map((heroId, order) => ({ draftId: id, team: side(t), order, heroId, heroNameSnapshot: this.heroName(heroId) })) });
        }
      }
    });
  }
  async listActive() { return (await this.db.draftRoom.findMany({ where: { status: { in: ['waiting', 'drafting', 'paused'] } } })).map(toRecord); }
  async listRecent(limit = 20) { return (await this.db.draftRoom.findMany({ orderBy: { createdAt: 'desc' }, take: limit })).map(toRecord); }
}

export async function syncHeroes(db: PrismaClient, heroes: Hero[]) {
  for (const h of heroes.filter((x) => !x.simulated)) {
    await db.hero.upsert({ where: { id: h.id }, create: { id: h.id, name: h.name, imageUrl: h.imageUrl }, update: { name: h.name, imageUrl: h.imageUrl, isActive: true } });
  }
}
