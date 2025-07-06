import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import mediaList from '../../data/mediaList.json';

// 简化的fallback组件
const SimpleFallback = () => (
  <div className="flex items-center justify-center h-full w-full">
    <div className="text-center">
      <div className="w-32 h-32 bg-design-yellow rounded-full flex items-center justify-center mb-4 mx-auto">
        <span className="text-4xl text-black">🎨</span>
      </div>
      <h2 className="text-xl text-light-gray">设计友好报</h2>
      <p className="text-light-gray opacity-60 mt-2">探索创意设计世界</p>
    </div>
  </div>
);

// 安全包装组件
const SafeRotatingSphere = () => {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const errorHandler = (error) => {
      console.error('Three.js error:', error);
      setHasError(true);
    };

    window.addEventListener('error', errorHandler);
    return () => window.removeEventListener('error', errorHandler);
  }, []);

  if (hasError) {
    return <SimpleFallback />;
  }

  return <RotatingSphere />;
};

const RotatingSphere = () => {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cubeGroupRef = useRef(null);
  const cameraRef = useRef(null);
  const mouseRef = useRef({ isDown: false, x: 0, y: 0 });
  const mouseSpeedRef = useRef({ 
    lastPosition: { x: 0, y: 0 },
    lastTime: 0,
    currentSpeed: 0,
    history: [], // 保存最近几次的速度历史
    lastUpdateTime: 0 // 添加性能优化：限制更新频率
  });
  const rotationRef = useRef({ x: 0, y: 0, z: 0 });
  const autoRotationRef = useRef({ x: 0.002, y: 0.005, z: 0.001 });
  const textureLoaderRef = useRef(new THREE.TextureLoader());
  const videoElementRef = useRef(null);
  const animationIdRef = useRef(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mousePosRef = useRef(new THREE.Vector2());
  const lastFrameTimeRef = useRef(0);
  
  // 立方体相关的引用
  const cubesDataRef = useRef([]);
  const sphereHelperRef = useRef(null); // 用于鼠标检测的不可见球体
  
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const [isInitialized, setIsInitialized] = useState(false);

  // 防止重复切换的引用
  const isLoadingTextureRef = useRef(false);
  const lastSwitchTimeRef = useRef(0);

  // 球体和立方体配置 - 移到hooks区域
  const SPHERE_CONFIG = useMemo(() => ({
    radius: 1.2,
    cubesPerRing: 20, // 每个环的立方体数量（减少以提升性能）
    rings: 30, // 环的数量（从36减少到30，减少16.7%）
    cubeSize: 0.24, // 立方体大小（从0.18增大到0.24，增大33%）
    flipRadius: 0.25, // 鼠标影响半径
    flipDuration: 250, // 翻转动画时长（进一步提升响应速度）
    trailDuration: 300, // 拖尾持续时间（毫秒）- 减少以提升性能
    returnDuration: 250, // 回归时间（毫秒）- 减少以提升性能
    maxTrailRotation: Math.PI * 0.6, // 拖尾最大旋转角度（减少）
    initialTrailVelocity: 3.0, // 初始拖尾旋转速度（减少以提升性能）
    
    // 物理交互参数
    maxFloatHeight: 0.04, // 最大浮起高度（降低弹出高度）
    springStiffness: 10.0, // 弹簧刚性（优化）
    dampingRatio: 0.7, // 阻尼比
    explodeDuration: 250, // 破裂效果持续时间（毫秒）
    explodeDistance: 0.1, // 破裂最大距离（减少）
    mouseSpeedThreshold: 1.8, // 触发破裂效果的鼠标速度阈值（提高以减少触发）
  }), []);

  // 计算球体大小
  const calculateSphereSize = useCallback(() => {
    const viewportHeight = window.innerHeight;
    const titleBottomPosition = 80;
    const cameraDistance = 3;
    const fov = 75;
    
    const worldHeight = 2 * cameraDistance * Math.tan(THREE.MathUtils.degToRad(fov / 2));
    const titleBottomInWorld = (titleBottomPosition / viewportHeight) * worldHeight;
    const bottomMargin = (40 / viewportHeight) * worldHeight;
    const availableHeight = worldHeight - titleBottomInWorld - bottomMargin;
    const radius = (availableHeight / 2) * 0.85;
    
    return Math.max(radius, 0.5);
  }, []);

  // 生成球面上的立方体位置和UV坐标
  const generateCubePositions = useCallback((radius) => {
    const positions = [];
    const uvCoords = [];
    const { rings, cubeSize } = SPHERE_CONFIG;
    
    // 调整环间距，确保纵向完全覆盖，增加微量重叠
    const ringSpacing = Math.PI / (rings + 1); // 稍微密集分布
    const cubeOverlap = 0.15; // 立方体重叠系数，从0.2减少到0.15（较大立方体需要较小重叠）
    
    for (let ring = 0; ring < rings; ring++) {
      const phi = (ring + 0.5) * ringSpacing; // 从0到π，均匀分布，避免极点重叠
      const ringRadius = Math.sin(phi) * radius;
      const y = Math.cos(phi) * radius;
      
      // 根据环的大小调整立方体数量，确保水平方向覆盖
      const circumference = 2 * Math.PI * ringRadius;
      let cubesInThisRing;
      
      if (ring === 0 || ring === rings - 1) {
        // 极点处放置足够立方体确保覆盖（从12减少到10）
        cubesInThisRing = 10;
      } else if (ring < 3 || ring > rings - 4) {
        // 接近极点的环增加密度（从14减少到12）
        cubesInThisRing = Math.max(12, Math.floor(circumference / (cubeSize * cubeOverlap * 0.8)));
      } else {
        // 其他环根据周长计算，确保完全覆盖（从16减少到14）
        cubesInThisRing = Math.max(14, Math.floor(circumference / (cubeSize * cubeOverlap * 0.9)));
      }
      
      for (let i = 0; i < cubesInThisRing; i++) {
        const theta = (i / cubesInThisRing) * 2 * Math.PI;
        const x = ringRadius * Math.cos(theta);
        const z = ringRadius * Math.sin(theta);
        
        const position = new THREE.Vector3(x, y, z);
        
        // 计算UV坐标
        const u = (theta / (2 * Math.PI) + 0.5) % 1;
        const v = 1 - (phi / Math.PI);
        
        positions.push(position);
        uvCoords.push({ u, v });
      }
    }
    
    return { positions, uvCoords };
  }, [SPHERE_CONFIG]);

  // 创建不同深浅的黄色材质（优化内存使用）
  const yellowMaterials = useMemo(() => ({
    // 右面 - #ffff00
    right: new THREE.MeshBasicMaterial({ 
      color: 0xffff00, // #ffff00
      transparent: true,
      opacity: 1.0
    }),
    // 左面 - #ffe600  
    left: new THREE.MeshBasicMaterial({ 
      color: 0xffe600, // #ffe600
      transparent: true,
      opacity: 1.0
    }),
    // 上面 - #ffff6b
    top: new THREE.MeshBasicMaterial({ 
      color: 0xffff6b, // #ffff6b
      transparent: true,
      opacity: 1.0
    }),
    // 下面 - #ffe600
    bottom: new THREE.MeshBasicMaterial({ 
      color: 0xffe600, // #ffe600
      transparent: true,
      opacity: 1.0
    }),
    // 后面 - #ffff00
    back: new THREE.MeshBasicMaterial({ 
      color: 0xffff00, // #ffff00
      transparent: true,
      opacity: 1.0
    })
  }), []);

  // 共享的立方体几何体（优化内存使用）
  const sharedCubeGeometry = useMemo(() => 
    new THREE.BoxGeometry(
      SPHERE_CONFIG.cubeSize, // 使用配置参数
      SPHERE_CONFIG.cubeSize,
      SPHERE_CONFIG.cubeSize
    ), [SPHERE_CONFIG.cubeSize]
  );

  // 创建立方体几何体和材质
  const createCubeMaterials = useCallback((videoTexture, uv) => {
    // 为每个立方体创建独特的贴图材质（正面）
    const frontMaterial = new THREE.MeshBasicMaterial({
      map: videoTexture ? videoTexture.clone() : null,
      transparent: true,
      opacity: 1.0,
    });
    
    // 设置UV偏移，让每个立方体显示贴图的不同部分
    if (frontMaterial.map) {
      frontMaterial.map.wrapS = THREE.RepeatWrapping;
      frontMaterial.map.wrapT = THREE.RepeatWrapping;
      
      // 计算UV偏移和重复（根据立方体大小调整）
      const uvSize = 0.055; // 每个立方体占用贴图的比例（从0.04增加到0.055，适应更大的立方体）
      frontMaterial.map.repeat.set(uvSize, uvSize);
      frontMaterial.map.offset.set(uv.u * (1 - uvSize), uv.v * (1 - uvSize));
      frontMaterial.map.needsUpdate = true;
    }
    
    return [
      yellowMaterials.right,  // 右面 - 亮黄色
      yellowMaterials.left,   // 左面 - 深黄色
      yellowMaterials.top,    // 上面 - 浅黄色
      yellowMaterials.bottom, // 下面 - 中等黄色
      frontMaterial,          // 前面（贴图面）
      yellowMaterials.back,   // 后面 - 暗黄色
    ];
  }, [yellowMaterials]);

  // 初始化立方体球体
  const initCubeSphere = useCallback((radius, videoTexture) => {
    console.log('初始化立方体球体...');
    
    // 清理之前的立方体
    if (cubeGroupRef.current) {
      sceneRef.current.remove(cubeGroupRef.current);
      cubeGroupRef.current = null;
    }
    
    const cubeGroup = new THREE.Group();
    const { positions, uvCoords } = generateCubePositions(radius);
    
    // 存储立方体数据
    const cubesData = [];
    
    positions.forEach((position, index) => {
      // 为每个立方体创建独特的材质
      const materials = createCubeMaterials(videoTexture, uvCoords[index]);
      
      // 创建立方体（使用共享几何体）
      const cube = new THREE.Mesh(sharedCubeGeometry, materials);
      
      // 设置位置
      cube.position.copy(position);
      
      // 计算朝向球心外的方向，确保立方体的正面（贴图面）朝外
      const direction = position.clone().normalize();
      const targetPosition = position.clone().add(direction.multiplyScalar(0.1));
      cube.lookAt(targetPosition);
      
      // 存储立方体数据
      const cubeData = {
        mesh: cube,
        originalPosition: position.clone(),
        originalRotation: cube.rotation.clone(),
        uv: uvCoords[index],
        isFlipped: false,
        flipProgress: 0,
        targetFlipProgress: 0,
        flipDelay: 0,
        delayTimer: 0,
        // 物理交互效果相关属性
        trailTimer: 0, // 拖尾计时器
        isInTrail: false, // 是否处于拖尾状态
        isInReturn: false, // 是否处于回归状态
        isExploding: false, // 是否处于破裂状态
        lastActiveTime: 0, // 最后一次被鼠标激活的时间
        trailIntensity: 0, // 拖尾强度
        
        // 旋转相关
        rotationVelocity: 0, // 旋转速度（弧度/秒）
        maxRotationAngle: 0, // 最大旋转角度
        currentRotationAngle: 0, // 当前旋转角度
        
        // 位置偏移相关（浮起效果）
        currentOffset: new THREE.Vector3(0, 0, 0), // 当前位置偏移
        targetOffset: new THREE.Vector3(0, 0, 0), // 目标位置偏移
        offsetVelocity: new THREE.Vector3(0, 0, 0), // 位置偏移速度
        maxOffset: 0, // 最大偏移距离
        
        // 物理弹簧属性
        springStiffness: 8.0, // 弹簧刚性
        dampingRatio: 0.6, // 阻尼比
        
        // 视觉效果
        currentOpacity: 1.0, // 当前透明度
        targetOpacity: 1.0, // 目标透明度
        
        // 破裂效果
        explodeTimer: 0, // 破裂计时器
        explodeDirection: new THREE.Vector3(0, 0, 0), // 破裂方向
        explodeIntensity: 0, // 破裂强度
      };
      
      cubesData.push(cubeData);
      cubeGroup.add(cube);
    });
    
    cubesDataRef.current = cubesData;
    cubeGroupRef.current = cubeGroup;
    sceneRef.current.add(cubeGroup);
    
    // 创建用于鼠标检测的不可见球体
    const sphereGeometry = new THREE.SphereGeometry(radius, 32, 32);
    const sphereMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      visible: false,
    });
    const sphereHelper = new THREE.Mesh(sphereGeometry, sphereMaterial);
    sphereHelperRef.current = sphereHelper;
    cubeGroup.add(sphereHelper);
    
    console.log(`创建了 ${cubesData.length} 个立方体`);
  }, [generateCubePositions, createCubeMaterials, sharedCubeGeometry]);

  // 更新立方体贴图（分批处理以提升性能，优先更新正面立方体）
  const updateCubeTextures = useCallback((videoTexture) => {
    if (!cubesDataRef.current.length || !videoTexture || !cameraRef.current || !cubeGroupRef.current) return;
    
    console.log('开始分批更新立方体贴图（优先正面）...');
    
    // 设置贴图的基本属性
    videoTexture.wrapS = THREE.RepeatWrapping;
    videoTexture.wrapT = THREE.RepeatWrapping;
    videoTexture.needsUpdate = true;
    
    // 获取摄像机位置（考虑球体组的变换）
    const cameraWorldPosition = new THREE.Vector3();
    cameraRef.current.getWorldPosition(cameraWorldPosition);
    
    // 将摄像机位置转换到立方体组的本地坐标系
    const cameraLocalPosition = cameraWorldPosition.clone();
    cubeGroupRef.current.worldToLocal(cameraLocalPosition);
    
    // 计算每个立方体的优先级（离摄像机越近、越正面的优先级越高）
    const cubesWithPriority = cubesDataRef.current.map((cubeData, index) => {
      // 计算立方体到摄像机的距离
      const distanceToCamera = cubeData.originalPosition.distanceTo(cameraLocalPosition);
      
      // 计算立方体朝向摄像机的程度（dot product）
      const cubeToCamera = cameraLocalPosition.clone().sub(cubeData.originalPosition).normalize();
      const cubeNormal = cubeData.originalPosition.clone().normalize(); // 立方体法线（朝外）
      const facingDot = cubeNormal.dot(cubeToCamera); // 值越大表示越朝向摄像机
      
      // 综合优先级：朝向权重70%，距离权重30%
      const facingScore = Math.max(0, facingDot); // 0-1，越大越正面
      const distanceScore = 1 / (1 + distanceToCamera * 0.5); // 距离越近分数越高
      const priority = facingScore * 0.7 + distanceScore * 0.3;
      
      return {
        cubeData,
        index,
        priority,
        distanceToCamera,
        facingScore
      };
    });
    
    // 按优先级排序（优先级高的在前）
    cubesWithPriority.sort((a, b) => b.priority - a.priority);
    
    console.log(`按优先级排序完成，最高优先级: ${cubesWithPriority[0].priority.toFixed(3)}，最低优先级: ${cubesWithPriority[cubesWithPriority.length - 1].priority.toFixed(3)}`);
    
    let currentIndex = 0;
    const batchSize = 25; // 稍微增加批次大小，因为有了智能排序
    const totalCubes = cubesWithPriority.length;
    
    const processBatch = () => {
      const endIndex = Math.min(currentIndex + batchSize, totalCubes);
      
      for (let i = currentIndex; i < endIndex; i++) {
        const { cubeData } = cubesWithPriority[i];
        
        // 更新前面（贴图面）的材质
        if (cubeData.mesh.material[4]) {
          // 释放旧材质的贴图资源
          const oldMaterial = cubeData.mesh.material[4];
          if (oldMaterial.map) {
            oldMaterial.map.dispose();
          }
          
          // 创建新材质
          const newMaterial = new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: oldMaterial.opacity || 1.0,
          });
          
          // 创建贴图副本并设置UV变换
          const textureClone = videoTexture.clone();
          textureClone.wrapS = THREE.RepeatWrapping;
          textureClone.wrapT = THREE.RepeatWrapping;
          
          const uvSize = 0.055;
          textureClone.repeat.set(uvSize, uvSize);
          textureClone.offset.set(cubeData.uv.u * (1 - uvSize), cubeData.uv.v * (1 - uvSize));
          textureClone.needsUpdate = true;
          
          newMaterial.map = textureClone;
          
          // 释放旧材质
          oldMaterial.dispose();
          
          // 更新材质
          cubeData.mesh.material[4] = newMaterial;
        }
      }
      
      currentIndex = endIndex;
      
      // 如果还有未处理的立方体，继续下一批
      if (currentIndex < totalCubes) {
        requestAnimationFrame(processBatch);
      } else {
        console.log(`完成更新 ${totalCubes} 个立方体的贴图（优先级排序）`);
      }
    };
    
    // 开始分批处理
    processBatch();
  }, []);

  // 处理鼠标移动时的立方体物理交互
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleCubeFlip = useCallback((intersectionPoint, mouseSpeed = 0) => {
    if (!cubesDataRef.current.length || !intersectionPoint || !cubeGroupRef.current) return;
    
    // 将世界坐标的交点转换为球体本地坐标
    const localIntersectionPoint = intersectionPoint.clone();
    cubeGroupRef.current.worldToLocal(localIntersectionPoint);
    
    const currentTime = performance.now();
    const isHighSpeed = mouseSpeed > SPHERE_CONFIG.mouseSpeedThreshold;
    
    cubesDataRef.current.forEach((cubeData) => {
      const distance = cubeData.originalPosition.distanceTo(localIntersectionPoint);
      
      // 计算影响强度
      if (distance < 0.25) {
        // 在影响半径内，立方体被激活
        const normalizedDistance = distance / 0.25;
        const fadeEffect = 1 - normalizedDistance; // 线性衰减
        
        // 如果鼠标速度很快，触发破裂效果
        if (isHighSpeed && !cubeData.isExploding) {
          cubeData.isExploding = true;
          cubeData.explodeTimer = 0;
          cubeData.explodeIntensity = Math.min(1.0, mouseSpeed / SPHERE_CONFIG.mouseSpeedThreshold);
          
          // 计算破裂方向（从球心向外）
          const direction = cubeData.originalPosition.clone().normalize();
          cubeData.explodeDirection.copy(direction);
          
          // 破裂时轻微透明度变化
          cubeData.targetOpacity = 0.85;
        } else if (!cubeData.isExploding) {
          // 正常交互
          cubeData.targetFlipProgress = Math.max(0.3, fadeEffect);
          cubeData.flipDelay = normalizedDistance * 0.05;
          
          // 计算浮起方向（从球心向外）
          const floatDirection = cubeData.originalPosition.clone().normalize();
          const floatDistance = SPHERE_CONFIG.maxFloatHeight * fadeEffect;
          cubeData.targetOffset.copy(floatDirection.multiplyScalar(floatDistance));
          cubeData.maxOffset = floatDistance;
          
          // 交互时轻微透明度变化
          cubeData.targetOpacity = 0.92;
        }
        
        // 更新状态属性
        cubeData.lastActiveTime = currentTime;
        cubeData.isInTrail = false;
        cubeData.isInReturn = false;
        cubeData.trailTimer = 0;
        cubeData.trailIntensity = fadeEffect;
        cubeData.rotationVelocity = 0;
        
      } else if (!cubeData.isInTrail && !cubeData.isInReturn && !cubeData.isExploding && cubeData.targetFlipProgress > 0) {
        // 鼠标离开但立方体之前被激活过，进入拖尾状态
        cubeData.isInTrail = true;
        cubeData.isInReturn = false;
        cubeData.trailTimer = 0;
        
        // 设置初始拖尾旋转速度
        cubeData.rotationVelocity = SPHERE_CONFIG.initialTrailVelocity * cubeData.trailIntensity;
        cubeData.maxRotationAngle = SPHERE_CONFIG.maxTrailRotation * cubeData.trailIntensity;
        cubeData.currentRotationAngle = cubeData.flipProgress * Math.PI;
      }
    });
  }, [SPHERE_CONFIG.mouseSpeedThreshold, SPHERE_CONFIG.maxFloatHeight, SPHERE_CONFIG.initialTrailVelocity, SPHERE_CONFIG.maxTrailRotation]);

  // 计算鼠标移动速度
  const calculateMouseSpeed = useCallback((x, y) => {
    const currentTime = performance.now();
    const deltaTime = currentTime - mouseSpeedRef.current.lastTime;
    
    if (deltaTime > 0) {
      const deltaX = x - mouseSpeedRef.current.lastPosition.x;
      const deltaY = y - mouseSpeedRef.current.lastPosition.y;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      const speed = distance / (deltaTime / 1000); // 像素/秒
      
      // 更新速度历史（保留最近5次）
      mouseSpeedRef.current.history.push(speed);
      if (mouseSpeedRef.current.history.length > 5) {
        mouseSpeedRef.current.history.shift();
      }
      
      // 计算平均速度以平滑波动
      const avgSpeed = mouseSpeedRef.current.history.reduce((sum, s) => sum + s, 0) / mouseSpeedRef.current.history.length;
      mouseSpeedRef.current.currentSpeed = avgSpeed;
      
      mouseSpeedRef.current.lastPosition = { x, y };
      mouseSpeedRef.current.lastTime = currentTime;
      
      return avgSpeed;
    }
    
    return mouseSpeedRef.current.currentSpeed;
  }, []);

  // 重置所有立方体的拖尾状态（鼠标离开球体时调用）
  const resetTrailStates = useCallback(() => {
    cubesDataRef.current.forEach((cubeData) => {
      if ((cubeData.targetFlipProgress > 0 || cubeData.targetOffset.length() > 0) && 
          !cubeData.isInTrail && !cubeData.isInReturn && !cubeData.isExploding) {
        // 将还未进入拖尾状态的立方体设置为拖尾状态
        cubeData.isInTrail = true;
        cubeData.isInReturn = false;
        cubeData.trailTimer = 0;
        cubeData.trailIntensity = Math.max(cubeData.targetFlipProgress, cubeData.targetOffset.length() / SPHERE_CONFIG.maxFloatHeight);
        
        // 设置初始拖尾旋转速度
        cubeData.rotationVelocity = SPHERE_CONFIG.initialTrailVelocity * cubeData.trailIntensity;
        cubeData.maxRotationAngle = SPHERE_CONFIG.maxTrailRotation * cubeData.trailIntensity;
        cubeData.currentRotationAngle = cubeData.flipProgress * Math.PI;
        
        // 开始位置偏移的物理回归
        cubeData.targetOffset.set(0, 0, 0);
        
        // 拖尾开始时保持当前透明度
        if (cubeData.currentOpacity < 0.92) {
          cubeData.currentOpacity = 0.92;
        }
      }
    });
  }, [SPHERE_CONFIG.maxFloatHeight, SPHERE_CONFIG.initialTrailVelocity, SPHERE_CONFIG.maxTrailRotation]);

  // 更新立方体物理动画系统
  const updateCubeAnimations = useCallback((deltaTime) => {
    if (!cubesDataRef.current.length) return;
    
    const speed = 1 / (SPHERE_CONFIG.flipDuration / 1000); // 转换为每秒的速度
    const deltaTimeMs = deltaTime * 1000; // 转换为毫秒
    
    cubesDataRef.current.forEach((cubeData) => {
      let needsUpdate = false;
      
      // 处理破裂效果
      if (cubeData.isExploding) {
        cubeData.explodeTimer += deltaTimeMs;
        
        if (cubeData.explodeTimer < SPHERE_CONFIG.explodeDuration) {
          // 破裂动画进行中
          const explodeProgress = cubeData.explodeTimer / SPHERE_CONFIG.explodeDuration;
          const easeOut = 1 - Math.pow(1 - explodeProgress, 3); // 缓出动画
          
          // 快速旋转
          cubeData.currentRotationAngle = easeOut * Math.PI * 2 * cubeData.explodeIntensity;
          
          // 向外弹出
          const explodeDistance = SPHERE_CONFIG.explodeDistance * cubeData.explodeIntensity * Math.sin(explodeProgress * Math.PI);
          cubeData.currentOffset.copy(cubeData.explodeDirection).multiplyScalar(explodeDistance);
          
          // 破裂时逐渐透明
          const explodeOpacity = 0.85 + (1 - explodeProgress) * 0.15;
          cubeData.currentOpacity = explodeOpacity;
          
          needsUpdate = true;
        } else {
          // 破裂效果结束，进入回归状态
          cubeData.isExploding = false;
          cubeData.isInReturn = true;
          cubeData.trailTimer = 0;
          cubeData.targetOpacity = 1.0;
        }
      }
      
      // 处理拖尾运动状态
      else if (cubeData.isInTrail) {
        cubeData.trailTimer += deltaTimeMs;
        
        if (cubeData.trailTimer < SPHERE_CONFIG.trailDuration) {
          // 拖尾阶段：继续翻转但速度逐渐减慢
          const trailProgress = cubeData.trailTimer / SPHERE_CONFIG.trailDuration;
          
          // 速度线性衰减到0
          cubeData.rotationVelocity = (SPHERE_CONFIG.initialTrailVelocity * cubeData.trailIntensity) * (1 - trailProgress);
          
          // 继续旋转
          cubeData.currentRotationAngle += cubeData.rotationVelocity * deltaTime;
          
          // 限制最大角度
          if (cubeData.currentRotationAngle > cubeData.maxRotationAngle) {
            cubeData.currentRotationAngle = cubeData.maxRotationAngle;
            cubeData.rotationVelocity = 0;
          }
          
          // 拖尾时透明度逐渐回升
          cubeData.targetOpacity = 0.92 + trailProgress * 0.08; // 从0.92逐渐回到1.0
          
          needsUpdate = true;
        } else {
          // 拖尾时间结束，进入回归阶段
          cubeData.isInTrail = false;
          cubeData.isInReturn = true;
          cubeData.trailTimer = 0;
          cubeData.rotationVelocity = 0;
        }
      }
      
      // 处理回归状态
      else if (cubeData.isInReturn) {
        cubeData.trailTimer += deltaTimeMs;
        
        const returnProgress = cubeData.trailTimer / SPHERE_CONFIG.returnDuration;
        const easeInOut = returnProgress < 0.5 ? 
          2 * returnProgress * returnProgress : 
          1 - Math.pow(-2 * returnProgress + 2, 3) / 2; // 缓入缓出
        
        if (returnProgress >= 1) {
          // 回归完成，重置所有状态
          cubeData.isInReturn = false;
          cubeData.currentRotationAngle = 0;
          cubeData.flipProgress = 0;
          cubeData.targetFlipProgress = 0;
          cubeData.trailTimer = 0;
          cubeData.trailIntensity = 0;
          cubeData.rotationVelocity = 0;
          cubeData.maxRotationAngle = 0;
          cubeData.currentOffset.set(0, 0, 0);
          cubeData.targetOffset.set(0, 0, 0);
          cubeData.currentOpacity = 1.0;
          cubeData.targetOpacity = 1.0;
          
          needsUpdate = true;
        } else {
          // 使用弹簧回归
          const currentAngle = cubeData.maxRotationAngle * (1 - easeInOut);
          cubeData.currentRotationAngle = currentAngle;
          
          // 位置偏移也回归
          cubeData.currentOffset.multiplyScalar(1 - easeInOut);
          
          // 透明度平滑回归到1.0
          cubeData.targetOpacity = cubeData.currentOpacity + (1.0 - cubeData.currentOpacity) * easeInOut;
          
          needsUpdate = true;
        }
      }
      
      // 处理正常状态的物理弹簧模拟
      else {
        // 简化延迟处理
        if (cubeData.flipDelay > 0) {
          cubeData.delayTimer += deltaTime;
          if (cubeData.delayTimer < cubeData.flipDelay) {
            return; // 还在延迟期间，跳过动画更新
          }
        }
        
        // 旋转动画
        const rotDiff = cubeData.targetFlipProgress - cubeData.flipProgress;
        if (Math.abs(rotDiff) > 0.01) {
          cubeData.flipProgress += Math.sign(rotDiff) * Math.min(Math.abs(rotDiff), speed * deltaTime);
          cubeData.currentRotationAngle = cubeData.flipProgress * Math.PI;
          needsUpdate = true;
        }
        
        // 物理弹簧模拟位置偏移
        const offsetDiff = cubeData.targetOffset.clone().sub(cubeData.currentOffset);
        if (offsetDiff.length() > 0.001) {
          // 弹簧力 = k * 位移
          const springForce = offsetDiff.clone().multiplyScalar(SPHERE_CONFIG.springStiffness);
          
          // 阻尼力 = -c * 速度
          const dampingForce = cubeData.offsetVelocity.clone().multiplyScalar(-SPHERE_CONFIG.dampingRatio);
          
          // 合力 = 弹簧力 + 阻尼力
          const totalForce = springForce.add(dampingForce);
          
          // 更新速度和位置
          cubeData.offsetVelocity.add(totalForce.multiplyScalar(deltaTime));
          cubeData.currentOffset.add(cubeData.offsetVelocity.clone().multiplyScalar(deltaTime));
          
          needsUpdate = true;
        } else {
          cubeData.offsetVelocity.set(0, 0, 0);
          cubeData.delayTimer = 0;
        }
        
        // 透明度动画（微妙变化）
        const opacityDiff = cubeData.targetOpacity - cubeData.currentOpacity;
        if (Math.abs(opacityDiff) > 0.005) {
          cubeData.currentOpacity += Math.sign(opacityDiff) * Math.min(Math.abs(opacityDiff), 2.0 * deltaTime);
          needsUpdate = true;
        } else {
          // 没有交互时回到完全不透明
          if (cubeData.targetFlipProgress === 0 && cubeData.targetOffset.length() === 0) {
            cubeData.targetOpacity = 1.0;
          }
        }
      }
      
      // 应用所有变换
      if (needsUpdate) {
        // 应用旋转
        cubeData.mesh.rotation.copy(cubeData.originalRotation);
        cubeData.mesh.rotateY(cubeData.currentRotationAngle);
        
        // 应用位置偏移
        const newPosition = cubeData.originalPosition.clone().add(cubeData.currentOffset);
        cubeData.mesh.position.copy(newPosition);
        
        // 应用透明度
        if (cubeData.mesh.material) {
          if (Array.isArray(cubeData.mesh.material)) {
            cubeData.mesh.material.forEach(mat => {
              if (mat && mat.opacity !== undefined) {
                mat.opacity = cubeData.currentOpacity;
              }
            });
          } else if (cubeData.mesh.material.opacity !== undefined) {
            cubeData.mesh.material.opacity = cubeData.currentOpacity;
          }
        }
        
        // 更新状态
        cubeData.flipProgress = cubeData.currentRotationAngle / Math.PI;
        cubeData.isFlipped = cubeData.flipProgress > 0.5;
      }
    });
  }, [SPHERE_CONFIG.flipDuration, SPHERE_CONFIG.explodeDuration, SPHERE_CONFIG.explodeDistance, SPHERE_CONFIG.trailDuration, SPHERE_CONFIG.initialTrailVelocity, SPHERE_CONFIG.returnDuration, SPHERE_CONFIG.springStiffness, SPHERE_CONFIG.dampingRatio]);

  // 初始化Three.js场景
  const initThreeJS = useCallback(() => {
    if (!mountRef.current) return {};

    console.log('初始化Three.js场景...');

    // 创建场景
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x131313);
    sceneRef.current = scene;

    // 创建相机
    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.z = 3;
    cameraRef.current = camera;

    // 创建渲染器
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    rendererRef.current = renderer;

    // 添加光源
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    // 将渲染器添加到DOM
    const mountElement = mountRef.current;
    mountElement.appendChild(renderer.domElement);

    console.log('Three.js场景初始化完成');
    setIsInitialized(true);
    return { scene, camera, renderer, mountElement };
  }, []);

  // 加载并应用贴图
  const loadAndApplyTexture = useCallback((filePath) => {
    console.log('尝试加载贴图:', filePath);
    const extension = filePath.split('.').pop().toLowerCase();
    
    if (['mp4', 'webm', 'mov'].includes(extension)) {
      // 视频贴图 - 改进资源管理
      if (videoElementRef.current) {
        const oldVideo = videoElementRef.current;
        oldVideo.pause();
        oldVideo.src = ''; // 清空src以释放资源
        oldVideo.load(); // 重新加载以确保资源释放
        if (oldVideo.parentNode) {
          oldVideo.parentNode.removeChild(oldVideo);
        }
        videoElementRef.current = null;
      }
      
      const video = document.createElement('video');
      video.src = filePath;
      video.muted = true;
      video.autoplay = true;
      video.loop = true;
      video.crossOrigin = 'anonymous';
      video.playsInline = true;
      video.preload = 'metadata'; // 只预加载元数据，提升性能
      
      video.style.display = 'none';
      document.body.appendChild(video);
      videoElementRef.current = video;
      
      const videoTexture = new THREE.VideoTexture(video);
      videoTexture.minFilter = THREE.LinearFilter;
      videoTexture.magFilter = THREE.LinearFilter;
      videoTexture.format = THREE.RGBFormat;
      
      const handleLoadedData = () => {
        console.log('视频贴图加载成功:', filePath);
        video.play().catch(console.error);
        
        // 如果立方体还没创建，则创建
        if (!cubeGroupRef.current) {
          const sphereRadius = calculateSphereSize();
          initCubeSphere(sphereRadius, videoTexture);
        } else {
          // 更新现有立方体的贴图
          updateCubeTextures(videoTexture);
        }
        
        // 清理事件监听器
        video.removeEventListener('loadeddata', handleLoadedData);
        video.removeEventListener('error', handleError);
      };
      
      const handleError = (error) => {
        console.error('视频贴图加载失败:', filePath, error);
        // 清理事件监听器
        video.removeEventListener('loadeddata', handleLoadedData);
        video.removeEventListener('error', handleError);
      };
      
      video.addEventListener('loadeddata', handleLoadedData);
      video.addEventListener('error', handleError);
      
      return videoTexture;
    } else {
      // 图片贴图
      const texture = textureLoaderRef.current.load(
        filePath,
        (loadedTexture) => {
          console.log('图片贴图加载成功:', filePath);
          loadedTexture.wrapS = THREE.RepeatWrapping;
          loadedTexture.wrapT = THREE.RepeatWrapping;
          loadedTexture.format = THREE.RGBFormat;
          
          if (!cubeGroupRef.current) {
            const sphereRadius = calculateSphereSize();
            initCubeSphere(sphereRadius, loadedTexture);
          } else {
            updateCubeTextures(loadedTexture);
          }
        },
        (progress) => {
          console.log('贴图加载进度:', progress, filePath);
        },
        (error) => {
          console.error('图片贴图加载失败:', filePath, error);
        }
      );
      
      return texture;
    }
  }, [calculateSphereSize, initCubeSphere, updateCubeTextures]);

  // 切换贴图（添加防抖机制）
  const switchTexture = useCallback(() => {
    if (mediaList.length === 0) return;
    
    const currentTime = Date.now();
    const timeSinceLastSwitch = currentTime - lastSwitchTimeRef.current;
    
    // 防抖：避免500ms内重复切换
    if (timeSinceLastSwitch < 500 || isLoadingTextureRef.current) {
      console.log('切换过于频繁，忽略此次请求');
      return;
    }
    
    isLoadingTextureRef.current = true;
    lastSwitchTimeRef.current = currentTime;
    
    const randomIndex = Math.floor(Math.random() * mediaList.length);
    setCurrentMediaIndex(randomIndex);
    
    console.log('切换贴图到:', mediaList[randomIndex]);
    
    // 异步加载贴图
    setTimeout(() => {
      loadAndApplyTexture(mediaList[randomIndex]);
      // 延迟重置加载状态，确保贴图更新完成
      setTimeout(() => {
        isLoadingTextureRef.current = false;
      }, 1000);
    }, 50);
  }, [loadAndApplyTexture]);

  // 鼠标事件处理
  const handleMouseDown = useCallback((event) => {
    mouseRef.current.isDown = true;
    mouseRef.current.x = event.clientX;
    mouseRef.current.y = event.clientY;
  }, []);

  const handleMouseMove = useCallback((event) => {
    // 更新鼠标位置用于射线检测
    if (!rendererRef.current) return;
    
    // 性能优化：限制检测频率到约30fps
    const now = performance.now();
    if (now - mouseSpeedRef.current.lastUpdateTime < 33) return;
    mouseSpeedRef.current.lastUpdateTime = now;
    
    // 计算鼠标速度
    const mouseSpeed = calculateMouseSpeed(event.clientX, event.clientY);
    
    const rect = rendererRef.current.domElement.getBoundingClientRect();
    mousePosRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mousePosRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    // 如果在拖拽，处理球体旋转
    if (mouseRef.current.isDown && cubeGroupRef.current) {
      const deltaX = event.clientX - mouseRef.current.x;
      const deltaY = event.clientY - mouseRef.current.y;
      
      rotationRef.current.y += deltaX * 0.01;
      rotationRef.current.x += deltaY * 0.01;
      
      cubeGroupRef.current.rotation.y = rotationRef.current.y;
      cubeGroupRef.current.rotation.x = rotationRef.current.x;
      cubeGroupRef.current.rotation.z = rotationRef.current.z;
      
      mouseRef.current.x = event.clientX;
      mouseRef.current.y = event.clientY;
    }
    
    // 无论是否在拖拽，都进行鼠标悬停检测（但拖拽时不翻转）
    if (sphereHelperRef.current && cameraRef.current) {
      raycasterRef.current.setFromCamera(mousePosRef.current, cameraRef.current);
      const intersects = raycasterRef.current.intersectObject(sphereHelperRef.current);
      
      if (intersects.length > 0 && !mouseRef.current.isDown) {
        // 只在非拖拽状态下翻转立方体，传入鼠标速度
        handleCubeFlip(intersects[0].point, mouseSpeed);
      } else if (!mouseRef.current.isDown) {
        // 鼠标不在球体上且没有拖拽时，启动拖尾效果
        resetTrailStates();
      }
    }
  }, [handleCubeFlip, resetTrailStates, calculateMouseSpeed]);

  const handleMouseUp = useCallback(() => {
    mouseRef.current.isDown = false;
  }, []);

  // 点击切换贴图
  const handleClick = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    console.log('点击事件触发');
    switchTexture();
  }, [switchTexture]);

  // 窗口大小调整
  const handleResize = useCallback(() => {
    if (!cameraRef.current || !rendererRef.current) return;
    
    cameraRef.current.aspect = window.innerWidth / window.innerHeight;
    cameraRef.current.updateProjectionMatrix();
    rendererRef.current.setSize(window.innerWidth, window.innerHeight);
    
    // 如果立方体球体已经存在，重新创建以适应新尺寸
    if (cubeGroupRef.current) {
      const newRadius = calculateSphereSize();
      const currentTexture = videoElementRef.current ? 
        new THREE.VideoTexture(videoElementRef.current) : null;
      
      if (currentTexture) {
        initCubeSphere(newRadius, currentTexture);
      }
    }
  }, [calculateSphereSize, initCubeSphere]);

  // 动画循环
  const animate = useCallback((currentTime = performance.now()) => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;
    
    // 性能优化：动态调整帧率
    const deltaTime = currentTime - lastFrameTimeRef.current;
    const targetFPS = mouseRef.current.isDown ? 60 : 30; // 拖拽时60fps，否则30fps
    const frameInterval = 1000 / targetFPS;
    
    if (deltaTime < frameInterval) {
      animationIdRef.current = requestAnimationFrame(animate);
      return;
    }
    
    lastFrameTimeRef.current = currentTime;
    const actualDeltaTime = Math.min(deltaTime / 1000, 0.033); // 限制最大帧时间
    
    // 自动旋转（除非正在拖拽）
    if (!mouseRef.current.isDown && cubeGroupRef.current) {
      cubeGroupRef.current.rotation.x += autoRotationRef.current.x;
      cubeGroupRef.current.rotation.y += autoRotationRef.current.y;
      cubeGroupRef.current.rotation.z += autoRotationRef.current.z;
      
      rotationRef.current.x = cubeGroupRef.current.rotation.x;
      rotationRef.current.y = cubeGroupRef.current.rotation.y;
      rotationRef.current.z = cubeGroupRef.current.rotation.z;
    }
    
    // 更新立方体翻转动画
    updateCubeAnimations(actualDeltaTime);
    
    rendererRef.current.render(sceneRef.current, cameraRef.current);
    animationIdRef.current = requestAnimationFrame(animate);
  }, [updateCubeAnimations]);

  useEffect(() => {
    console.log('组件初始化开始...');
    
    // 初始化Three.js
    const { scene, renderer, mountElement } = initThreeJS();
    
    if (!renderer || !mountElement) return;
    
    // 添加事件监听器
    const canvas = renderer.domElement;
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('click', handleClick);
    window.addEventListener('resize', handleResize);
    
    // 开始动画
    animate();
    
    // 加载初始贴图
    if (mediaList.length > 0) {
      const randomIndex = Math.floor(Math.random() * mediaList.length);
      setCurrentMediaIndex(randomIndex);
      console.log('选择初始贴图索引:', randomIndex, '文件:', mediaList[randomIndex]);
      
      setTimeout(() => {
        loadAndApplyTexture(mediaList[randomIndex]);
      }, 100);
    }
    
    // 清理函数
    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      
      if (canvas) {
        canvas.removeEventListener('mousedown', handleMouseDown);
        canvas.removeEventListener('mousemove', handleMouseMove);
        canvas.removeEventListener('mouseup', handleMouseUp);
        canvas.removeEventListener('click', handleClick);
      }
      window.removeEventListener('resize', handleResize);
      
      if (mountElement && renderer.domElement && mountElement.contains(renderer.domElement)) {
        mountElement.removeChild(renderer.domElement);
      }
      
      if (videoElementRef.current) {
        videoElementRef.current.pause();
        videoElementRef.current.remove();
      }
      
      if (scene) {
        scene.clear();
      }
      if (renderer) {
        renderer.dispose();
      }
      
      // 清理立方体相关资源
      cubesDataRef.current.forEach((cubeData) => {
        if (cubeData.mesh.geometry) {
          cubeData.mesh.geometry.dispose();
        }
        if (cubeData.mesh.material) {
          if (Array.isArray(cubeData.mesh.material)) {
            cubeData.mesh.material.forEach(mat => mat.dispose());
          } else {
            cubeData.mesh.material.dispose();
          }
        }
      });
      cubesDataRef.current = [];
    };
  }, [animate, handleClick, handleMouseDown, handleMouseMove, handleMouseUp, handleResize, initThreeJS, loadAndApplyTexture]);

  // 当媒体文件加载完成且Three.js初始化完成时，确保贴图正确加载
  useEffect(() => {
    if (mediaList.length > 0 && isInitialized && currentMediaIndex >= 0) {
      console.log('Three.js已初始化，加载贴图:', mediaList[currentMediaIndex]);
      
      const filePath = mediaList[currentMediaIndex];
      loadAndApplyTexture(filePath);
    }
  }, [currentMediaIndex, isInitialized, loadAndApplyTexture]);

  return (
    <>
      {/* Three.js 立方体球体容器 */}
      <div 
        ref={mountRef} 
        style={{ 
          width: '100vw', 
          height: '100vh', 
          position: 'fixed',
          top: 0,
          left: 0,
          cursor: mouseRef.current?.isDown ? 'grabbing' : 'grab',
          zIndex: 1
        }} 
      />
    </>
  );
};

export default SafeRotatingSphere; 