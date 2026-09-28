/** RGB projection helpers shared by the mobile image canvas and tests. */

export function wavelengthToRgb(wavelength) {
  const value = Number(wavelength);
  let r = 0; let g = 0; let b = 0;
  if (value >= 380 && value < 440) {
    r = -(value - 440) / 60; b = 1;
  } else if (value < 490) {
    g = (value - 440) / 50; b = 1;
  } else if (value < 510) {
    g = 1; b = -(value - 510) / 20;
  } else if (value < 580) {
    r = (value - 510) / 70; g = 1;
  } else if (value < 645) {
    r = 1; g = -(value - 645) / 65;
  } else if (value <= 750) {
    r = 1;
  }
  let factor = 1;
  if (value >= 380 && value < 420) factor = 0.3 + 0.7 * (value - 380) / 40;
  else if (value > 700 && value <= 750) factor = 0.3 + 0.7 * (750 - value) / 50;
  return { r: r * factor, g: g * factor, b: b * factor };
}

/** Mutate RGBA pixel data to match the backend's RGB weighting and inversion. */
export function applyImageFilters(data, targetWavelength, invert = false) {
  const hasWavelength = targetWavelength !== null
    && targetWavelength !== undefined
    && targetWavelength !== 'full';
  let projection = { r: 1, g: 1, b: 1 };
  let redWeight = 0.299; let greenWeight = 0.587; let blueWeight = 0.114;
  if (hasWavelength) {
    projection = wavelengthToRgb(targetWavelength);
    const total = projection.r + projection.g + projection.b;
    if (total > 0) {
      redWeight = projection.r / total;
      greenWeight = projection.g / total;
      blueWeight = projection.b / total;
    }
  }
  for (let index = 0; index < data.length; index += 4) {
    let red = data[index]; let green = data[index + 1]; let blue = data[index + 2];
    if (hasWavelength) {
      const intensity = redWeight * red + greenWeight * green + blueWeight * blue;
      red = Math.min(255, Math.max(0, intensity * projection.r));
      green = Math.min(255, Math.max(0, intensity * projection.g));
      blue = Math.min(255, Math.max(0, intensity * projection.b));
    }
    data[index] = invert ? 255 - red : red;
    data[index + 1] = invert ? 255 - green : green;
    data[index + 2] = invert ? 255 - blue : blue;
  }
  return data;
}
