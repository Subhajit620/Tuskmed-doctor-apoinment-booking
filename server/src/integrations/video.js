const videoService = require('../services/video/videoService');

/**
 * WebRTC video calling integration.
 * Delegates to videoService architecture.
 */
async function createRoom(appointmentId, startTime) {
  const result = await videoService.createMeeting({ id: appointmentId, slot: { start: startTime } });
  return {
    name: result.roomName || `tuskmed-${appointmentId.slice(0, 8)}`,
    url: result.meetingUrl,
    meetingId: result.meetingId,
    mocked: result.provider === 'mock',
  };
}

module.exports = { createRoom, videoService };
