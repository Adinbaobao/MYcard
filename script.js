const STORAGE_KEY = "ding-baotang-card-theme";
const INTRO_STORAGE_KEY = "ding-baotang-card-intro";
const AVATAR_STORAGE_KEY = "ding-baotang-card-avatar";
const LEGACY_AVATAR_SETTINGS_STORAGE_KEY = "ding-baotang-card-avatar-settings";
const DEFAULT_AVATAR = "assets/avatar-engineer.png";
const CROP_OUTPUT_SIZE = 900;
const themes = new Set(["minimal", "space", "survey", "map"]);

const buttons = Array.from(document.querySelectorAll(".theme-button"));
const intro = document.querySelector(".intro");
const avatar = document.querySelector("#profile-avatar");
const avatarUpload = document.querySelector("#avatar-upload");
const cropModal = document.querySelector("#avatar-crop-modal");
const cropStage = document.querySelector("#avatar-crop-stage");
const cropImage = document.querySelector("#avatar-crop-image");
const cropClose = document.querySelector("#avatar-crop-close");
const cropCancel = document.querySelector("#avatar-crop-cancel");
const cropApply = document.querySelector("#avatar-crop-apply");

let cropSession = null;
const MIN_CROP_SCALE = 0.35;
const MAX_CROP_SCALE = 5;

function applyTheme(theme) {
  const nextTheme = themes.has(theme) ? theme : "minimal";
  document.body.dataset.theme = nextTheme;

  buttons.forEach((button) => {
    const isActive = button.dataset.themeValue === nextTheme;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  localStorage.setItem(STORAGE_KEY, nextTheme);
}

const savedTheme = localStorage.getItem(STORAGE_KEY);
applyTheme(savedTheme || "minimal");

buttons.forEach((button) => {
  button.addEventListener("click", () => {
    applyTheme(button.dataset.themeValue);
  });
});

if (intro) {
  const savedIntro = localStorage.getItem(INTRO_STORAGE_KEY);

  if (savedIntro !== null) {
    intro.textContent = savedIntro;
  }

  intro.addEventListener("input", () => {
    localStorage.setItem(INTRO_STORAGE_KEY, intro.textContent.trim());
  });

  intro.addEventListener("paste", (event) => {
    event.preventDefault();
    const text = event.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
  });
}

function setAvatar(src, isCustom) {
  if (!avatar) {
    return;
  }

  avatar.src = src;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", reject);
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", reject);
    image.src = src;
  });
}

function getCropMetrics() {
  if (!cropSession || !cropStage) {
    return null;
  }

  const stageSize = cropStage.getBoundingClientRect().width;
  const imageRatio = cropSession.image.naturalWidth / cropSession.image.naturalHeight;
  const baseWidth = imageRatio >= 1 ? stageSize * imageRatio : stageSize;
  const baseHeight = imageRatio >= 1 ? stageSize : stageSize / imageRatio;
  const width = baseWidth * cropSession.scale;
  const height = baseHeight * cropSession.scale;

  return {
    stageSize,
    width,
    height,
    naturalWidth: cropSession.image.naturalWidth,
    naturalHeight: cropSession.image.naturalHeight,
  };
}

function clampCropPosition(metrics) {
  const maxX = Math.max(0, (metrics.width + metrics.stageSize) / 2);
  const maxY = Math.max(0, (metrics.height + metrics.stageSize) / 2);

  cropSession.x = Math.min(maxX, Math.max(-maxX, cropSession.x));
  cropSession.y = Math.min(maxY, Math.max(-maxY, cropSession.y));
}

function zoomCrop(nextScale, centerX, centerY) {
  if (!cropSession || !cropStage) {
    return;
  }

  const rect = cropStage.getBoundingClientRect();
  const centerOffsetX = centerX - rect.left - rect.width / 2;
  const centerOffsetY = centerY - rect.top - rect.height / 2;
  const previousScale = cropSession.scale;
  const clampedScale = Math.min(MAX_CROP_SCALE, Math.max(MIN_CROP_SCALE, nextScale));
  const scaleRatio = clampedScale / previousScale;

  cropSession.x = centerOffsetX - (centerOffsetX - cropSession.x) * scaleRatio;
  cropSession.y = centerOffsetY - (centerOffsetY - cropSession.y) * scaleRatio;
  cropSession.scale = clampedScale;
  renderCrop();
}

function getPointerDistance() {
  if (!cropSession || cropSession.pointers.size < 2) {
    return 0;
  }

  const points = Array.from(cropSession.pointers.values());
  return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
}

function getPointerCenter() {
  const points = Array.from(cropSession.pointers.values());
  const total = points.reduce(
    (sum, point) => ({
      x: sum.x + point.x,
      y: sum.y + point.y,
    }),
    { x: 0, y: 0 }
  );

  return {
    x: total.x / points.length,
    y: total.y / points.length,
  };
}

function renderCrop() {
  if (!cropSession || !cropImage) {
    return;
  }

  const metrics = getCropMetrics();

  if (!metrics) {
    return;
  }

  clampCropPosition(metrics);

  cropImage.style.width = `${metrics.width}px`;
  cropImage.style.height = `${metrics.height}px`;
  cropImage.style.transform = `translate(calc(-50% + ${cropSession.x}px), calc(-50% + ${cropSession.y}px))`;
}

function openCropModal(src, image) {
  if (!cropModal || !cropImage) {
    return;
  }

  cropSession = {
    src,
    image,
    scale: 1,
    x: 0,
    y: 0,
    isDragging: false,
    isPinching: false,
    startX: 0,
    startY: 0,
    startOffsetX: 0,
    startOffsetY: 0,
    pointers: new Map(),
    pinchStartDistance: 0,
    pinchStartScale: 1,
  };

  cropImage.src = src;
  cropModal.hidden = false;
  document.body.classList.add("is-crop-open");

  requestAnimationFrame(renderCrop);
}

function closeCropModal() {
  if (cropModal) {
    cropModal.hidden = true;
  }

  document.body.classList.remove("is-crop-open");
  cropSession = null;

  if (avatarUpload) {
    avatarUpload.value = "";
  }
}

function createCroppedAvatar() {
  const metrics = getCropMetrics();

  if (!cropSession || !metrics) {
    return null;
  }

  const outputScale = CROP_OUTPUT_SIZE / metrics.stageSize;
  const imageLeft = metrics.stageSize / 2 + cropSession.x - metrics.width / 2;
  const imageTop = metrics.stageSize / 2 + cropSession.y - metrics.height / 2;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  canvas.width = CROP_OUTPUT_SIZE;
  canvas.height = CROP_OUTPUT_SIZE;
  context.fillStyle = "#f3f8fb";
  context.fillRect(0, 0, CROP_OUTPUT_SIZE, CROP_OUTPUT_SIZE);
  context.drawImage(
    cropSession.image,
    imageLeft * outputScale,
    imageTop * outputScale,
    metrics.width * outputScale,
    metrics.height * outputScale
  );

  return canvas.toDataURL("image/jpeg", 0.9);
}

const savedAvatar = localStorage.getItem(AVATAR_STORAGE_KEY);

if (savedAvatar) {
  setAvatar(savedAvatar, true);
} else {
  setAvatar(DEFAULT_AVATAR, false);
}

localStorage.removeItem(LEGACY_AVATAR_SETTINGS_STORAGE_KEY);

if (avatarUpload) {
  avatarUpload.addEventListener("change", async () => {
    const file = avatarUpload.files && avatarUpload.files[0];

    if (!file || !file.type.startsWith("image/")) {
      return;
    }

    try {
      const source = await readFileAsDataUrl(file);
      const image = await loadImage(source);
      openCropModal(source, image);
    } catch (error) {
      avatarUpload.value = "";
    }
  });
}

if (cropStage) {
  cropStage.addEventListener("pointerdown", (event) => {
    if (!cropSession) {
      return;
    }

    cropSession.pointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    cropSession.isDragging = true;
    cropSession.startX = event.clientX;
    cropSession.startY = event.clientY;
    cropSession.startOffsetX = cropSession.x;
    cropSession.startOffsetY = cropSession.y;

    if (cropSession.pointers.size === 2) {
      cropSession.isPinching = true;
      cropSession.pinchStartDistance = getPointerDistance();
      cropSession.pinchStartScale = cropSession.scale;
    }

    cropStage.classList.add("is-dragging");
    cropStage.setPointerCapture(event.pointerId);
  });

  cropStage.addEventListener("pointermove", (event) => {
    if (!cropSession || !cropSession.pointers.has(event.pointerId)) {
      return;
    }

    cropSession.pointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    if (cropSession.isPinching && cropSession.pointers.size >= 2) {
      const distance = getPointerDistance();
      const center = getPointerCenter();

      if (cropSession.pinchStartDistance > 0) {
        zoomCrop(cropSession.pinchStartScale * (distance / cropSession.pinchStartDistance), center.x, center.y);
      }

      return;
    }

    if (!cropSession.isDragging) {
      return;
    }

    cropSession.x = cropSession.startOffsetX + event.clientX - cropSession.startX;
    cropSession.y = cropSession.startOffsetY + event.clientY - cropSession.startY;
    renderCrop();
  });

  const stopDragging = (event) => {
    if (!cropSession) {
      return;
    }

    cropSession.pointers.delete(event.pointerId);
    cropSession.isDragging = false;
    cropSession.isPinching = false;
    cropStage.classList.remove("is-dragging");

    if (cropStage.hasPointerCapture(event.pointerId)) {
      cropStage.releasePointerCapture(event.pointerId);
    }
  };

  cropStage.addEventListener("pointerup", stopDragging);
  cropStage.addEventListener("pointercancel", stopDragging);

  cropStage.addEventListener("wheel", (event) => {
    if (!cropSession) {
      return;
    }

    event.preventDefault();
    const zoomFactor = event.deltaY < 0 ? 1.08 : 0.92;
    zoomCrop(cropSession.scale * zoomFactor, event.clientX, event.clientY);
  }, { passive: false });
}

if (cropApply) {
  cropApply.addEventListener("click", () => {
    const nextAvatar = createCroppedAvatar();

    if (!nextAvatar) {
      return;
    }

    localStorage.setItem(AVATAR_STORAGE_KEY, nextAvatar);
    setAvatar(nextAvatar, true);
    closeCropModal();
  });
}

[cropClose, cropCancel].forEach((button) => {
  if (!button) {
    return;
  }

  button.addEventListener("click", closeCropModal);
});

if (cropModal) {
  cropModal.addEventListener("click", (event) => {
    if (event.target === cropModal) {
      closeCropModal();
    }
  });
}

window.addEventListener("resize", renderCrop);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && cropSession) {
    closeCropModal();
  }
});
