/// <reference path="emscripten.d.ts"/>

declare var loadModule: (options: Tiff.InitializeOptions) => typeof Module;
declare class Tiff {
    private _filename;
    private _tiffPtr;
    private static uniqueIdForFileName;
    private static Module;
    static initialize(options: Tiff.InitializeOptions): void;
    constructor(params: Tiff.Params);
    width(): number;
    height(): number;
    currentDirectory(): number;
    countDirectory(): number;
    setDirectory(index: number): void;
    getField(tag: number): number;
    readRGBAImage(): ArrayBuffer;
    getScale(width: number, height: number, canvas: HTMLCanvasElement, context: CanvasRenderingContext2D): number ;
    isMobile(): Boolean;
    filterArea(origImg: Uint8Array, filteredImg: Uint8Array, startRow: number, endRow: number, startCol: number, endCol: number, rowScale: number, colScale: number, scale: number, rowBytes: number, newRowBytes: number, numComps: number);
    filter(img: Uint8Array, originalWidth: number, originalHeight: number, scale: number): Uint8Array;
    toCanvas(): HTMLCanvasElement;
    toDataURL(): string;
    close(): void;
    private static createUniqueFileName();
    private static createFileSystemObjectFromBuffer(buffer);
}
declare module Tiff {
    export interface InitializeOptions {
        TOTAL_MEMORY?: number;
    }
    export interface Params {
        buffer: ArrayBuffer;
    }
    export class Exception {
        message: string;
        name: string;
        constructor(message: string);
    }
    export var Tag: any;
}
declare var process: any;
declare var require: any;
declare var module: any;
declare var define: any;
declare var self: any;

export = Tiff;