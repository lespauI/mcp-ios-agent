// Mock implementation for OpenCV module
const cv = {
  // Image class
  Mat: jest.fn().mockImplementation(() => {
    return {
      empty: jest.fn().mockReturnValue(false),
      rows: 100,
      cols: 100,
      channels: jest.fn().mockReturnValue(3),
      type: jest.fn().mockReturnValue(16),
      sizes: [100, 100],
      copyTo: jest.fn(),
      resize: jest.fn(),
      convertTo: jest.fn(),
      cvtColor: jest.fn(),
      getData: jest.fn().mockReturnValue(Buffer.from('mock-image-data')),
      setTo: jest.fn(),
      add: jest.fn(),
      subtract: jest.fn(),
      compare: jest.fn(),
      threshold: jest.fn(),
      matchTemplate: jest.fn().mockReturnValue({
        minMaxLoc: jest.fn().mockReturnValue({
          minVal: 0.1,
          maxVal: 0.9,
          minLoc: { x: 10, y: 10 },
          maxLoc: { x: 50, y: 50 }
        })
      })
    };
  }),
  
  // Constants
  COLOR_BGR2GRAY: 6,
  COLOR_RGB2GRAY: 7,
  THRESH_BINARY: 0,
  TM_CCOEFF_NORMED: 3,
  
  // Functions
  imread: jest.fn().mockImplementation(() => {
    return new cv.Mat();
  }),
  imwrite: jest.fn().mockReturnValue(true),
  imencode: jest.fn().mockReturnValue([true, Buffer.from('mock-encoded-image')]),
  imdecode: jest.fn().mockReturnValue(new cv.Mat()),
  findContours: jest.fn().mockReturnValue([[], []]),
  rectangle: jest.fn(),
  putText: jest.fn(),
  minMaxLoc: jest.fn().mockReturnValue({
    minVal: 0.1,
    maxVal: 0.9,
    minLoc: { x: 10, y: 10 },
    maxLoc: { x: 50, y: 50 }
  }),
  getStructuringElement: jest.fn().mockReturnValue(new cv.Mat()),
  cvtColor: jest.fn().mockImplementation(() => new cv.Mat()),
  threshold: jest.fn().mockImplementation(() => new cv.Mat()),
  matchTemplate: jest.fn().mockImplementation(() => new cv.Mat()),
  getPerspectiveTransform: jest.fn().mockReturnValue(new cv.Mat()),
  warpPerspective: jest.fn().mockImplementation(() => new cv.Mat()),
  Point2: jest.fn().mockImplementation((x, y) => ({ x, y })),
  Size: jest.fn().mockImplementation((width, height) => ({ width, height })),
  Rect: jest.fn().mockImplementation((x, y, width, height) => ({ x, y, width, height })),
  Scalar: jest.fn().mockImplementation((v1, v2, v3, v4) => [v1, v2, v3, v4])
};

// Export the mock OpenCV module
module.exports = cv; 