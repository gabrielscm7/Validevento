const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUUIDv4(value) {
  if (!value || typeof value !== 'string') return false;
  return UUID_V4_REGEX.test(value.trim());
}

module.exports = { isValidUUIDv4 };
