class BackendReadinessChecker {
  constructor(qbWebUIClient) {
    this.qbWebUIClient = qbWebUIClient;
  }

  async waitForReady(scenario = "none") {
    if (scenario === "force-ready") {
      return {
        ready: true,
        simulated: true,
        detail: "simulated-ready",
        attempts: 1,
        baseUrl: "simulated://force-ready",
        qbtVersion: "simulated"
      };
    }

    if (scenario === "force-readiness-timeout") {
      return {
        ready: false,
        simulated: true,
        detail: "simulated-timeout",
        state: "timeout",
        attempts: 1
      };
    }

    const result = await this.qbWebUIClient.waitForUsable();
    if (result.ok) {
      return {
        ready: true,
        simulated: false,
        detail: result.detail,
        baseUrl: result.baseUrl,
        qbtVersion: result.version,
        attempts: 1
      };
    }

    return {
      ready: false,
      simulated: false,
      detail: result.detail,
      state: result.state,
      attempts: 1
    };
  }
}

module.exports = {
  BackendReadinessChecker
};
