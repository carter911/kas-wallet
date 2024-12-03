import express from 'express';
import { submitForm, getStatus, cancel } from '../controllers/taskControoler';
import { balance, generateAddress, importAddress, send, transfer } from '../controllers/walletControoler';

const router = express.Router();

router.post('/tasks/submit', submitForm);
router.get('/tasks/status', getStatus);
router.post('/tasks/cancel', cancel);

router.post('/wallet/generate', generateAddress);
router.post('/wallet/import', importAddress);
router.post('/wallet/balance', balance);
router.post('/wallet/send', send);
router.post('/wallet/transfer', transfer);

export default router;
