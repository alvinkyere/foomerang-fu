export type DemoService = [name: string, pnpmArgs: string[], env: Record<string, string>];

export function demoServices(options: {
  tls: Record<string, string>;
  serverUrl: string;
  controllerUrl: string;
}): DemoService[];
