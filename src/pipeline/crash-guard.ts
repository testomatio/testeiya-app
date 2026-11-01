/**
 * While an agent stage runs in this process, an error nobody caught (an
 * extension, a tool) would kill the pipeline without a word in its state.
 * The guard hands it to `onCrash`, which records the stage and exits.
 */
export class CrashGuard {
  private readonly listener = (err: unknown) => this.onCrash(err);

  constructor(private readonly onCrash: (err: unknown) => void) {}

  arm(): void {
    process.on("uncaughtException", this.listener);
    process.on("unhandledRejection", this.listener);
  }

  disarm(): void {
    process.off("uncaughtException", this.listener);
    process.off("unhandledRejection", this.listener);
  }
}
