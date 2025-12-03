// Minimal vscode runtime stub for tests
import Module from "module";

type Overrides = Partial<typeof vscodeStub>;

class StubEventEmitter<T = any> {
  private listeners: Array<(value: T) => void> = [];
  readonly event = (listener: (value: T) => void) => {
    this.listeners.push(listener);
    return { dispose() {} } as any;
  };
  fire(value?: T): void {
    for (const listener of this.listeners) {
      listener(value as T);
    }
  }
}

class StubTreeItem {
  description?: string;
  tooltip?: string;
  contextValue?: string;
  command?: any;
  iconPath?: any;
  constructor(public label: string, public collapsibleState: number = 0) {}
}

class StubThemeIcon {
  constructor(public id: string) {}
}

const vscodeStub = {
  EventEmitter: StubEventEmitter,
  TreeItem: StubTreeItem,
  ThemeIcon: StubThemeIcon,
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  Uri: { parse: (value: string) => ({ toString: () => value }) },
  workspace: {
    getConfiguration: () => ({ get: () => undefined }),
    fs: { stat: async () => ({}) }
  },
  window: {
    showInformationMessage: (..._args: any[]) => undefined,
    showWarningMessage: (..._args: any[]) => undefined,
    showErrorMessage: (..._args: any[]) => undefined
  }
};

export function installVscodeStub(overrides: Overrides = {}) {
  const ModuleLoad = (Module as any)._load as any;
  const merged = { ...vscodeStub, ...overrides };
  (Module as any)._load = function (request: string, parent: any, isMain: boolean) {
    if (request === "vscode") {
      return merged;
    }
    return ModuleLoad.call(this, request, parent, isMain);
  };
  return () => {
    (Module as any)._load = ModuleLoad;
  };
}
