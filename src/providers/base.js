export class VisionProvider {
  constructor(config) {
    this.config = config
  }

  async analyze(base64, mime, prompt) {
    throw new Error('Not implemented')
  }
}
