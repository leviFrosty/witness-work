/**
 * Skia's CanvasKit, which only the web downloads (`loadCanvasKit.web.ts`). iOS
 * and Android draw with Skia's native library, which is always there.
 */
export const isCanvasKitLoaded = () => true

export const loadCanvasKit = (): Promise<void> => Promise.resolve()
