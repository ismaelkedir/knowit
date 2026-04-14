declare module "update-notifier" {
  export interface UpdateNotifierPackage {
    name: string;
    version: string;
  }

  export interface UpdateNotifierOptions {
    pkg: UpdateNotifierPackage;
    shouldNotifyInNpmScript?: boolean;
    updateCheckInterval?: number;
  }

  export interface UpdateNotifierInstance {
    notify(): UpdateNotifierInstance;
  }

  export default function updateNotifier(options: UpdateNotifierOptions): UpdateNotifierInstance;
}
