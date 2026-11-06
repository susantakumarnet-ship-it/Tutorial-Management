import { Router } from 'express';
import { z } from 'zod';
import { authenticate, currentUser, requireRole } from '../../middleware/auth';
import { body, params, queryParams } from '../../middleware/validate';
import { ah } from '../../utils/asyncHandler';
import { pageQuery } from '../../utils/pagination';
import { idParam, optionalText, uuid } from '../../utils/validators';
import * as svc from './applications.service';

const router = Router();
router.use(authenticate, requireRole('PARENT', 'TUTOR'));

/** Tutor applies for a parent's posted requirement ("Apply for Tuition"). */
router.post(
  '/',
  requireRole('TUTOR'),
  ah(async (req, res) => {
    const input = body(
      req,
      z.object({
        requirementId: uuid,
        message: optionalText(1000),
        proposedFee: z.number().int().min(100).max(200000).nullable().optional(),
      }),
    );
    const user = currentUser(req);
    const id = await svc.applyToRequirement(user.id, input.requirementId, input.message, input.proposedFee ?? null);
    res.status(201).json(await svc.getForUser(id, user));
  }),
);

/** Parent sends a tuition request directly to a tutor found through search. */
router.post(
  '/direct',
  requireRole('PARENT'),
  ah(async (req, res) => {
    const input = body(req, z.object({ tutorId: uuid, studentId: uuid, message: optionalText(1000) }));
    const user = currentUser(req);
    const id = await svc.requestTutor(user.id, input.tutorId, input.studentId, input.message);
    res.status(201).json(await svc.getForUser(id, user));
  }),
);

router.get(
  '/',
  ah(async (req, res) => {
    const f = queryParams(
      req,
      pageQuery.extend({
        box: z.enum(['incoming', 'outgoing']).optional(),
        status: z.enum(['PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN']).optional(),
        requirementId: uuid.optional(),
      }),
    );
    res.json(await svc.list(currentUser(req), f));
  }),
);

router.get(
  '/:id',
  ah(async (req, res) => {
    res.json(await svc.getForUser(params(req, idParam).id, currentUser(req)));
  }),
);

router.post(
  '/:id/accept',
  ah(async (req, res) => {
    res.json(await svc.respond(params(req, idParam).id, currentUser(req), 'ACCEPTED'));
  }),
);

router.post(
  '/:id/reject',
  ah(async (req, res) => {
    res.json(await svc.respond(params(req, idParam).id, currentUser(req), 'REJECTED'));
  }),
);

router.post(
  '/:id/withdraw',
  ah(async (req, res) => {
    res.json(await svc.withdraw(params(req, idParam).id, currentUser(req)));
  }),
);

export default router;
