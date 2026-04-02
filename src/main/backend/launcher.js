const { spawn } = require("child_process");

class BackendLauncher {
  constructor() {
    this.child = null;
  }

  launch(executablePath, scenario = "none", launchOptions = {}) {
    if (scenario === "force-launch-fail") {
      return {
        ok: false,
        simulated: true,
        error: "simulated launch failure"
      };
    }

    if (scenario === "force-ready" || scenario === "force-readiness-timeout") {
      return {
        ok: true,
        simulated: true,
        pid: -1
      };
    }

    try {
      const args = Array.isArray(launchOptions.args) ? launchOptions.args : [];
      const childEnv = launchOptions.env && typeof launchOptions.env === "object"
        ? { ...process.env, ...launchOptions.env }
        : process.env;
      this.child = spawn(executablePath, args, {
        detached: false,
        windowsHide: true,
        stdio: "ignore",
        cwd: launchOptions.cwd || undefined,
        env: childEnv
      });

      return {
        ok: true,
        simulated: false,
        pid: this.child.pid || 0,
        launchArgs: args
      };
    } catch (error) {
      return {
        ok: false,
        simulated: false,
        error: error && error.message ? error.message : "unknown launch error"
      };
    }
  }
}

module.exports = {
  BackendLauncher
};
