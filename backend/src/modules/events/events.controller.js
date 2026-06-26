const eventsService = require('./events.service');

async function getActive(req, res) {
  try {
    const event = await eventsService.getActiveEvent();
    if (!event) return res.status(404).json({ error: 'Nenhum evento ativo encontrado.' });
    return res.status(200).json(event);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

module.exports = { getActive };
