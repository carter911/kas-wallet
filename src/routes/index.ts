import express from 'express';
import { submitForm, getStatus, cancel } from '../controllers/taskControoler';
import {
    balance,
    generateAddress,
    importAddress,
    importByPrivateKey,
    send,
    transfer,
    market,
    sell,
    buy,
    sellCancel,
    deploy,
    feeEstimation
} from '../controllers/walletControoler';

const router = express.Router();

router.post('/tasks/submit', submitForm);
router.get('/tasks/status', getStatus);
router.post('/tasks/cancel', cancel);

router.post('/wallet/generate', generateAddress);
router.post('/wallet/import', importAddress);
router.post('/wallet/import_privateKey', importByPrivateKey);
router.post('/wallet/balance', balance);
router.post('/wallet/send', send);
router.post('/wallet/deploy', deploy);
router.post('/wallet/transfer', transfer);
router.post('/wallet/market', market);
router.get('/wallet/fee', feeEstimation);
router.post('/wallet/sell', sell);
router.post('/wallet/sell_cancel', sellCancel);

router.post('/wallet/buy', buy);
export default router;
