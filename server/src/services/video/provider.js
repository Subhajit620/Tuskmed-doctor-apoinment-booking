const crypto = require('crypto');
const env = require('../../config/env');

/**
 * Daily.co / WebRTC Video Provider Implementation
 */
class DailyVideoProvider {
  constructor() {
    this.apiKey = process.env.VIDEO_API_KEY || env.daily?.apiKey || '';
    this.domain = process.env.VIDEO_BASE_URL || env.daily?.domain || 'tuskmed.daily.co';
    this.isMock = env.mock.video || !this.apiKey;
  }

  async createMeeting(appointment) {
    const meetingId = `room_${appointment.id.replace(/-/g, '').slice(0, 12)}`;
    const roomName = `tuskmed-${appointment.id.slice(0, 8)}`;
    const startTime = appointment.slot?.start || appointment.createdAt || new Date();

    if (this.isMock) {
      const mockCode = crypto.randomBytes(4).toString('hex');
      const meetingUrl = `https://${this.domain}/${roomName}?mock=${mockCode}`;
      return {
        meetingId,
        roomName,
        meetingUrl,
        provider: 'mock',
      };
    }

    const expTimestamp = Math.floor(new Date(startTime).getTime() / 1000) + 3 * 60 * 60; // 3 hours after start

    const res = await fetch('https://api.daily.co/v1/rooms', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: roomName,
        properties: {
          exp: expTimestamp,
          enable_chat: true,
          enable_screenshare: true,
          start_video_off: false,
          start_audio_off: false,
        },
      }),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      // If room name already exists, retrieve room details
      if (res.status === 400 && errBody.info?.includes('already exists')) {
        return {
          meetingId,
          roomName,
          meetingUrl: `https://${this.domain}/${roomName}`,
          provider: 'daily',
        };
      }
      throw new Error(`Daily.co video room creation failed: ${res.status} ${JSON.stringify(errBody)}`);
    }

    const room = await res.json();
    return {
      meetingId: room.id || meetingId,
      roomName: room.name || roomName,
      meetingUrl: room.url || `https://${this.domain}/${roomName}`,
      provider: 'daily',
    };
  }

  async getMeeting(roomName) {
    if (this.isMock) {
      return { roomName, active: true };
    }
    const res = await fetch(`https://api.daily.co/v1/rooms/${roomName}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) return null;
    return res.json();
  }

  async endMeeting(roomName) {
    if (this.isMock) return { success: true };
    const res = await fetch(`https://api.daily.co/v1/rooms/${roomName}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    return { success: res.ok };
  }
}

module.exports = { DailyVideoProvider };
