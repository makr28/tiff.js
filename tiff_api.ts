declare var loadModule: (options: Tiff.InitializeOptions) => typeof Module;

class Tiff {
  private _filename: string;
  private _tiffPtr: number;
  private static uniqueIdForFileName = 0;
  private static Module: typeof Module = null;

  public static initialize(options: Tiff.InitializeOptions): void {
    if (Tiff.Module !== null) { return; }
    Tiff.Module = loadModule(options);
  }

  constructor(params: Tiff.Params) {
    if (Tiff.Module === null) {
      Tiff.initialize({});
    }
    this._filename = Tiff.createFileSystemObjectFromBuffer(params.buffer);
    this._tiffPtr = Tiff.Module.ccall('TIFFOpen', 'number', [
      'string', 'string'], [ this._filename, 'r']);
    if (this._tiffPtr === 0) {
      throw new Tiff.Exception('The function TIFFOpen returns NULL')
    }
  }

  width(): number {
    return this.getField(Tiff.Tag.IMAGEWIDTH);
  }

  height(): number {
    return this.getField(Tiff.Tag.IMAGELENGTH);
  }

  currentDirectory(): number {
    return Tiff.Module.ccall('TIFFCurrentDirectory', 'number',
                             ['number'], [this._tiffPtr]);
  }

  countDirectory(): number {
    var count = 0;
    var current = this.currentDirectory();
    while (true) {
      count += 1;
      var status = Tiff.Module.ccall('TIFFReadDirectory', 'number',
                                     ['number'], [this._tiffPtr]);
      if (status === 0) { break; }
    }
    this.setDirectory(current);
    return count;
  }

  setDirectory(index: number): void {
    return Tiff.Module.ccall('TIFFSetDirectory', 'number',
                             ['number', 'number'], [this._tiffPtr, index]);
  }

  getField(tag: number): number {
    var value: number = Tiff.Module.ccall('GetField', 'number', ['number', 'number'], [
      this._tiffPtr, tag]);
    return value;
  }

  readRGBAImage(): ArrayBuffer {
    var width = this.width();
    var height = this.height();
    var raster: number = Tiff.Module.ccall('_TIFFmalloc', 'number',
                                           ['number'], [width * height * 4])
    var result: number = Tiff.Module.ccall('TIFFReadRGBAImageOriented', 'number', [
      'number', 'number', 'number', 'number', 'number', 'number'], [
      this._tiffPtr, width, height, raster, 1, 0
    ]);

    if (result === 0) {
      throw new Tiff.Exception('The function TIFFReadRGBAImageOriented returns NULL');
    }
    // copy the subarray, not create new sub-view
    var data = <ArrayBuffer>(<any>Tiff.Module.HEAPU8.buffer).slice(
      raster,
      raster + width * height * 4
    );
    Tiff.Module.ccall('free', 'number', ['number'], [raster]);
    return data;
  }

	/// <summary>
  /// Checks the device for canvas size restraints by drawing a pixel to the canvas and reading it back. 
  /// If it can read back the set data, the canvas size is fine.
  /// Else it will increment the scale by 1 and try again with the newly sized canvas. 
  /// </summary>
  /// <param name='width'>The width of the unaltered image</param>
  /// <param name='height'>The height of the unaltered image</param>
  /// <param name='canvas'>The canvas that will display the image</param>
  /// <param name='context'>Holds the image data</param>
  /// <return>
  /// Returns the required scale for the image so that it can be rendered on the user's device
  /// </return>
  getScale(width: number, height: number, canvas: HTMLCanvasElement, context: CanvasRenderingContext2D): number {
    var testColor = "#ffffff";
    var colorData = new Uint8ClampedArray(4);
    var tiffSize = width * height;
    var scale = 0;

    while (colorData[0] != 255)
    {
        scale += 1;
        canvas.width = width / scale;
        canvas.height = height / scale;       
        context.fillStyle = testColor;
        context.fillRect(0,0,1,1);
        colorData = context.getImageData(0,0,1,1).data;
    }
    
    return scale;
  }

  /// <summary>
  /// Checks if the device is mobile or not
  /// </summary>
  /// <return>
  /// Returns true if the device is mobile, false if not
  /// </return>
  isMobile(): Boolean {
    return /Mobi/.test(navigator.userAgent);
  }

	/// <summary>
  /// Filters the given area of the image into the given area of the new array
  /// </summary>
  /// <param name='filteredImg'>The filtered image being modified in the method</param>
  /// <param name='startRow'>The row in the filtered image to start modifying</param>
  /// <param name='endRow'>The row in the filtered image to end modifying</param>
  /// <param name='startCol'>The column in the filtered image to start modifying</param>
  /// <param name='endCol'>The column in the filtered image to end modifying</param>
  /// <param name='rowWindow'>The number to scale the rows by - might differ from scale due to overflow conditions</param>
  /// <param name='colWindow'>The number to scale the columns by - might differ from scale due to overflow conditions</param>
  /// <param name='scale'>The number your scaling the image by</param>
  /// <param name='rowBytes'>The number of bytes used by 1 row of pixels in the original unaltered image</param>
  /// <param name='newRowBytes'>The number of bytes used by 1 row of pixels in the new filtered image</param>
  /// <param name='numComps'>The number of bytes 1 pixel uses - (RGBA) Red is 1 byte, Blue is 1 byte, Green is 1 byte, Alpha is 1 byte</param>  
  /// <remarks>
  /// This method takes a box of pixels based on the rowWindow and colWindow values and averages them into 1 pixel in the new filtered image
  /// </remarks>
  filterArea(origImg: Uint8Array, filteredImg: Uint8Array, scale: number, rowBytes: number, newRowBytes: number, numComps: number, filterData: any) {             
    var sumR, sumG, sumB, sumA;
    var boxRow, boxCol;
    var destIdx = 0;
    var scaleByScale = filterData.rowWindow * filterData.colWindow;

    //Filter the given area of the image
    for (var row = filterData.startRow; row < filterData.endRow; row++)
    {
      var srcRow = row * scale;
      for(var col = filterData.startCol; col < filterData.endCol; col += numComps)
      {
              destIdx = row * newRowBytes + col;
              var srcCol = col * scale;
              sumR = 0;
              sumG = 0;
              sumB = 0;
              sumA = 0;
              
              // Get the average color of all of the pixels that are being downsized into one. The box of pixels will be based on the given scale.
              for(boxRow = 0; boxRow < filterData.rowWindow; boxRow++) 
              { 
                var srcRowIdx = srcCol + rowBytes * (srcRow + boxRow);
                for(boxCol = 0; boxCol < filterData.colWindow; boxCol++) 
                {
                        var srcPixelIdx = srcRowIdx + numComps * boxCol;
                        sumR += origImg[srcPixelIdx];
                        sumG += origImg[srcPixelIdx + 1];
                        sumB += origImg[srcPixelIdx + 2];
                        sumA += origImg[srcPixelIdx + 3];
                }
              }
              filteredImg[destIdx++] = sumR / scaleByScale;
              filteredImg[destIdx++] = sumG / scaleByScale;
              filteredImg[destIdx++] = sumB / scaleByScale;
              filteredImg[destIdx] = sumA / scaleByScale;
      }
    } 
  }
  
  /// <summary>
  /// Filters an image to a size that can be rendered on the user's device
  /// </summary>
  /// <param name='img'>The original unaltered image</param>
  /// <param name='originalWidth'>The width of the unaltered image</param>
  /// <param name='originalHeight'>The height of the unaltered image</param>
  /// <param name='scale'>The scale to resize the image by</param>
  /// <remarks>
  /// This method calculates various required values to filter the image, the new width and height,
  ///  the bytes per row in both the original image and the filtered image, and the overflow values needed 
  ///  if the image can't be divided up evenly 
  /// </remarks>
  /// <return>
  /// Returns the filtered image of a size the device is capable of rendering
  /// </return>
  filter(img: Uint8Array, originalWidth: number, originalHeight: number, scale: number): Uint8Array {               
    var drawWidth = Math.ceil(originalWidth/scale);
    var drawHeight = Math.ceil(originalHeight/scale);  
    
    var numComps = 4; // 4 bytes per pixel, tifs are always coming thru here as RGBA

    var rowBytes = originalWidth * numComps; // Amount of Bytes in a row in the original image
    var newRowBytes = drawWidth * numComps; // Amount of Bytes in a row in the new image
              
    var newImgArray = new Uint8Array(drawHeight * newRowBytes);       

    // Calculate Overflow
    var overflowRowCnt = originalHeight % scale; // The remainder of the rows after the rest of the rows were divided evenly by the scale
    var overflowDestRow = overflowRowCnt > 0 ? drawHeight - 1 : originalHeight; // The index of the last row in the new filtered image, where the overflow rows will be placed

    var overflowColCnt = originalWidth % scale; // The remainder of the columns after the rest of the columns were divided evenly by the scale
    var overflowDestCol = overflowColCnt > 0 ? newRowBytes - numComps : newRowBytes; // The index of the last column in the new filtered image, where the overflow columns will be placed

    // Fill in Main Area 
    this.filterArea(img, newImgArray, scale, rowBytes, newRowBytes, numComps, 
      {startRow: 0, endRow: overflowDestRow,  startCol: 0, endCol: overflowDestCol, rowWindow: scale, colWindow: scale}
    );
    
    // Fill in overflow row area
    if (overflowRowCnt > 0)
      this.filterArea(img, newImgArray, scale, rowBytes, newRowBytes, numComps, 
        {startRow: overflowDestRow,  endRow: drawHeight, startCol: 0, endCol: overflowDestCol, rowWindow: overflowRowCnt, colWindow: scale}
      );
            
    // Fill in overflow column area 
    if (overflowColCnt > 0)      
      this.filterArea(img, newImgArray, scale, rowBytes, newRowBytes, numComps, 
        {startRow: 0, endRow: overflowDestRow,  startCol: overflowDestCol, endCol: newRowBytes, rowWindow: scale, colWindow: overflowColCnt}
      );

    // Fill in overflow corner area
    if(overflowRowCnt > 0 && overflowColCnt > 0)
      this.filterArea(img, newImgArray, scale, rowBytes, newRowBytes, numComps, 
        {startRow: overflowDestRow,  endRow: drawHeight, startCol: overflowDestCol, endCol: newRowBytes, rowWindow: overflowRowCnt, colWindow: overflowColCnt}
      );

    return newImgArray; 
  }

  toCanvas(): HTMLCanvasElement {
    var width = this.width();
    var height = this.height();
    var raster = Tiff.Module.ccall('_TIFFmalloc', 'number', ['number'], [width * height * 4]);
    var result = Tiff.Module.ccall('TIFFReadRGBAImageOriented', 'number', [
        'number', 'number', 'number', 'number', 'number', 'number'], [
        this._tiffPtr, width, height, raster, 1, 0
    ]);
    if (result === 0) {
        throw new Tiff.Exception('The function TIFFReadRGBAImageOriented returns NULL');
    }
    var image = Tiff.Module.HEAPU8.subarray(raster, raster + width * height * 4);
    var canvas = document.createElement('canvas');
    var context = canvas.getContext('2d');
    // If on a mobile device, check if the image is too large to display 
    if(this.isMobile())
    {                
        // Test if image is too large for the device and get the correct scale for the image        
        var scale = this.getScale(width, height, canvas, context);

        if (scale > 1) 
        {        
            image = this.filter(image, width, height, scale);
            width =  Math.ceil(width/scale);
            height =  Math.ceil(height/scale);
        }  
    }  
    canvas.width = width;
    canvas.height = height;       
    var imageData = context.createImageData(width, height);
    imageData.data.set(image);
    context.putImageData(imageData, 0, 0);
    Tiff.Module.ccall('free', 'number', ['number'], [raster]);
    return canvas;
  }

  toDataURL(): string {
    return this.toCanvas().toDataURL();
  }

  close(): void {
    Tiff.Module.ccall('TIFFClose', 'number', ['number'], [this._tiffPtr]);
  }

  private static createUniqueFileName(): string {
    Tiff.uniqueIdForFileName += 1;
    return String(Tiff.uniqueIdForFileName) + '.tiff';
  }

  private static createFileSystemObjectFromBuffer(buffer: ArrayBuffer): string {
    var filename = Tiff.createUniqueFileName();
    Tiff.Module.FS.createDataFile('/', filename, new Uint8Array(buffer), true, false);
    return filename;
  }
}

module Tiff {
  export interface InitializeOptions {
    TOTAL_MEMORY?: number;
  }

  export interface Params {
    buffer: ArrayBuffer;
  }

  export class Exception {
    name: string = 'Tiff.Exception';
    constructor(public message: string) {}
  }

  export var Tag: typeof TiffTag = TiffTag;
}

// for closure compiler
Tiff.prototype['width'] = Tiff.prototype.width;
Tiff.prototype['height'] = Tiff.prototype.height;
Tiff.prototype['currentDirectory'] = Tiff.prototype.currentDirectory;
Tiff.prototype['countDirectory'] = Tiff.prototype.countDirectory;
Tiff.prototype['setDirectory'] = Tiff.prototype.setDirectory;
Tiff.prototype['getField'] = Tiff.prototype.getField;
Tiff.prototype['readRGBAImage'] = Tiff.prototype.readRGBAImage;
Tiff.prototype['close'] = Tiff.prototype.close;
Tiff['Exception'] = Tiff.Exception;
Tiff['initialize'] = Tiff.initialize;

// export to node, amd, window or worker
declare var process: any;
declare var require: any;
declare var module: any;
declare var define: any;
declare var self: any;

if (typeof process === 'object' && typeof require === 'function') { // NODE
  module['exports'] = Tiff;
} else if (typeof define === "function" && define.amd) { // AMD
  define('tiff', <any>[], () => Tiff);
} else if (typeof window === 'object') { // WEB
  window['Tiff'] = Tiff;
} else if (typeof importScripts === 'function') { // WORKER
  self['Tiff'] = Tiff;
}
