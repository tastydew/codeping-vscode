declare module "play-sound" {
  interface PlayerInstance {
    play: (file: string, options?: Record<string, any>, callback?: (err: unknown) => void) => any;
  }

  interface PlaySoundFactory {
    (options?: { player?: string; players?: string[] }): PlayerInstance;
  }

  const createPlayer: PlaySoundFactory;
  export = createPlayer;
}
