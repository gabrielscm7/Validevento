const { Router } = require('express');
const eventsController = require('./events.controller');

const router = Router();

router.get('/active', eventsController.getActive);

module.exports = router;
