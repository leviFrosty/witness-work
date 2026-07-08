// moment ships its locale files as untyped JS; TypeScript 6 started
// requiring resolvable types even for side-effect imports (TS2882), so
// declare the whole subpath as an ambient module.
declare module 'moment/locale/*'
