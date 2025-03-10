export class MatMock {
  cols: number;
  rows: number;
  channels: number;
  empty: () => boolean;
  
  constructor(rows: number, cols: number, type?: number, channels = 3) {
    this.cols = cols;
    this.rows = rows;
    this.channels = channels;
    this.empty = () => false;
  }
  
  copyTo(mat: MatMock) {
    mat.cols = this.cols;
    mat.rows = this.rows;
    return mat;
  }
  
  convertTo(type: number, alpha?: number, beta?: number) {
    return this;
  }
  
  resize(rows: number, cols: number) {
    this.rows = rows;
    this.cols = cols;
    return this;
  }
  
  add(mat: MatMock) {
    return this;
  }
  
  subtract(mat: MatMock) {
    return this;
  }
  
  absdiff(mat: MatMock) {
    return this;
  }
  
  threshold(thresh: number, maxVal: number, type: number) {
    return this;
  }
  
  cvtColor(code: number) {
    return this;
  }
  
  matchTemplate(template: MatMock, method: number) {
    return new MatMock(1, 1);
  }
  
  minMaxLoc() {
    return {
      minVal: 0,
      maxVal: 0.9,
      minLoc: { x: 0, y: 0 },
      maxLoc: { x: 10, y: 20 }
    };
  }
  
  drawRectangle(
    pt1: { x: number; y: number },
    pt2: { x: number; y: number },
    color: number[],
    thickness?: number
  ) {
    return this;
  }
}

class CVMock {
  static COLOR_BGR2GRAY = 6;
  static COLOR_BGR2RGB = 4;
  static COLOR_RGB2BGR = 4;
  static THRESH_BINARY = 0;
  static TM_CCOEFF_NORMED = 5;
  static RETR_EXTERNAL = 0;
  static CHAIN_APPROX_SIMPLE = 1;
  static MORPH_RECT = 0;
  static LINE_8 = 8;
  
  static imencode(ext: string, img: MatMock) {
    return Buffer.alloc(1024);
  }
  
  static imdecode(buffer: Buffer, flag: number) {
    return new MatMock(100, 100);
  }
  
  static imread(path: string, flag?: number) {
    return new MatMock(100, 100);
  }
  
  static imwrite(path: string, img: MatMock) {
    return true;
  }
  
  static countNonZero(mat: MatMock) {
    return Math.floor(mat.rows * mat.cols * 0.1);
  }
  
  static getStructuringElement(shape: number, size: { width: number; height: number }) {
    return new MatMock(size.height, size.width);
  }
  
  static findContours(img: MatMock, mode: number, method: number) {
    return [
      [
        { x: 10, y: 10 },
        { x: 50, y: 10 },
        { x: 50, y: 50 },
        { x: 10, y: 50 }
      ]
    ];
  }
  
  static contourArea(contour: Array<{ x: number; y: number }>) {
    return 1000;
  }
  
  static boundingRect(contour: Array<{ x: number; y: number }>) {
    return { x: 10, y: 10, width: 40, height: 40 };
  }
}

export default CVMock; 