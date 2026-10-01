const { DailyVideoProvider } = require('./provider');

class VideoService {
  constructor() {
    this.provider = new DailyVideoProvider();
  }

  setProvider(customProvider) {
    this.provider = customProvider;
  }

  async createMeeting(appointment) {
    return this.provider.createMeeting(appointment);
  }

  async getMeeting(meetingId) {
    return this.provider.getMeeting(meetingId);
  }

  async endMeeting(meetingId) {
    return this.provider.endMeeting(meetingId);
  }
}

module.exports = new VideoService();
