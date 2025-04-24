var AMapWX = require('../../libs/amap-wx.js');
const config = require('../../libs/config.js');
const app = getApp();

Page({
  data: {
    // 地图导航部分
    latitude: 23.099994,  // 初始纬度
    longitude: 113.324520,  // 初始经度
    scale: 16,  // 缩放级别，范围 5-18
    markers: [],  // 标记点
    polyline: [],  // 路线
    isNavigating: false,  // 是否正在导航
    startPoint: null,  // 起点
    endPoint: null,  // 终点
    distance: 0,  // 距离（米）
    duration: 0,  // 时间（分钟）
    formattedDistance: '0m',
    includePoints: [],  // 视野包含点
    
    // 道路预警部分
    lanes: [
      { showCar: false, speed: 0, distance: 0 },
      { showCar: false, speed: 0, distance: 0 },
      { showCar: false, speed: 0, distance: 0 }
    ],
    // 蓝牙连接状态
    isConnected: false,
    deviceId: null
  },

  onLoad: function (options) {
    // 地图导航初始化
    if (!config || !config.Config || !config.Config.key) {
      console.error('高德地图API Key配置异常，请检查config.js');
      wx.showToast({
        title: 'API Key配置错误',
        icon: 'none',
        duration: 2000
      });
      return;
    }
    
    // 确保始终关闭loading，避免配对问题
    wx.hideLoading();
    
    // 获取当前位置
    this.getLocation();
    
    // 道路预警初始化
    this.initBLE();
    
    // 模拟车辆数据（仅用于测试）
    this.simulateCarData();
  },

  onShow: function () {
    // 确保始终关闭loading，避免配对问题
    wx.hideLoading();
    
    // 页面显示时可能需要刷新位置
    if (!this.data.isNavigating) {
      this.getLocation();
    }
  },
  
  onHide: function() {
    // 页面隐藏时确保关闭loading
    wx.hideLoading();
  },
  
  onUnload: function() {
    // 页面卸载时确保关闭loading
    wx.hideLoading();
    
    // 清除导航定时器
    if (this.locationTimer) {
      clearInterval(this.locationTimer);
    }
    
    // 清除模拟数据定时器
    if (this.simulationTimer) {
      clearInterval(this.simulationTimer);
    }
    
    // 页面卸载时断开蓝牙连接
    if (this.data.isConnected) {
      app.disconnectBLE();
    }
  },

  // ===== 地图导航功能 =====

  // 获取当前位置
  getLocation: function () {
    try {
      wx.showLoading({
        title: '定位中...',
      });
      
      wx.getLocation({
        type: 'gcj02',
        success: (res) => {
          const latitude = parseFloat(res.latitude.toFixed(6));
          const longitude = parseFloat(res.longitude.toFixed(6));
          
          this.setData({
            latitude,
            longitude,
            markers: [{
              id: 0,
              latitude,
              longitude,
              width: 30,
              height: 30,
              iconPath: '../../images/location.png',
              callout: {
                content: '当前位置',
                color: '#000000',
                fontSize: 12,
                borderWidth: 1,
                borderColor: '#cccccc',
                borderRadius: 5,
                padding: 5,
                display: 'ALWAYS'
              }
            }],
            startPoint: {
              latitude,
              longitude
            }
          });
          
          wx.hideLoading();
        },
        fail: (error) => {
          console.error('获取位置失败:', error);
          wx.hideLoading();
          wx.showToast({
            title: '获取位置失败',
            icon: 'none'
          });
        },
        complete: () => {
          // 确保无论成功还是失败都关闭loading
          wx.hideLoading();
        }
      });
    } catch (error) {
      console.error('getLocation发生错误:', error);
      wx.hideLoading();
    }
  },

  // 选择终点
  chooseLocation: function () {
    wx.chooseLocation({
      success: (res) => {
        const { latitude, longitude, name, address } = res;
        
        // 确保latitude和longitude是数值类型，并保留6位小数
        const lat = parseFloat(latitude.toFixed(6));
        const lng = parseFloat(longitude.toFixed(6));
        
        if (isNaN(lat) || isNaN(lng)) {
          wx.showToast({
            title: '位置信息无效',
            icon: 'none'
          });
          return;
        }
        
        // 确保所有marker都有明确的数字坐标
        const currentMarkers = [...this.data.markers].filter(marker => marker.id === 0);
        const destinationMarker = {
          id: 1,
          latitude: lat,
          longitude: lng,
          width: 30,
          height: 30,
          iconPath: '../../images/destination.png',
          callout: {
            content: name || '目的地',
            color: '#000000',
            fontSize: 12,
            borderWidth: 1,
            borderColor: '#cccccc',
            borderRadius: 5,
            padding: 5,
            display: 'ALWAYS'
          }
        };
        
        this.setData({
          endPoint: {
            latitude: lat,
            longitude: lng,
            name,
            address
          },
          markers: [...currentMarkers, destinationMarker]
        });
        
        // 使用高德地图API获取驾车路线
        this.getRoute();
      },
      fail: (error) => {
        console.error('选择位置失败:', error);
      }
    });
  },
  
  // 获取高德地图路线
  getRoute: function() {
    if (!this.data.startPoint || !this.data.endPoint) {
      wx.showToast({
        title: '请先选择起点和终点',
        icon: 'none'
      });
      return;
    }
    
    try {
      wx.showLoading({
        title: '规划路线中...',
      });
      
      const { startPoint, endPoint } = this.data;
      
      // 按照高德官方格式组织起点和终点
      const origin = `${startPoint.longitude},${startPoint.latitude}`;
      const destination = `${endPoint.longitude},${endPoint.latitude}`;
      
      console.log('规划路线 - 起点:', origin);
      console.log('规划路线 - 终点:', destination);
      
      // 创建高德地图实例
      const myAmapFun = new AMapWX({
        key: config.Config.key
      });
      
      // 使用驾车路线规划
      myAmapFun.getDrivingRoute({
        origin: origin,
        destination: destination,
        success: (data) => {
          console.log('驾车路线数据:', data);
          
          if (!data.paths || !data.paths[0]) {
            console.error('未返回有效的路线数据');
            wx.hideLoading();
            wx.showToast({
              title: '未找到合适的驾车路线',
              icon: 'none'
            });
            return;
          }
          
          // 提取路线点 - 按照官方示例的方式解析数据
          const points = [];
          if (data.paths && data.paths[0] && data.paths[0].steps) {
            // 兼容处理：使用steps属性
            const steps = data.paths[0].steps;
            for (let i = 0; i < steps.length; i++) {
              if (steps[i].polyline) {
                const polyline = steps[i].polyline.split(';');
                for (let j = 0; j < polyline.length; j++) {
                  const point = polyline[j].split(',');
                  points.push({
                    longitude: parseFloat(point[0]),
                    latitude: parseFloat(point[1])
                  });
                }
              }
            }
          }
          
          console.log('路线点数量:', points.length);
          
          if (points.length === 0) {
            wx.hideLoading();
            wx.showToast({
              title: '路线点数据为空',
              icon: 'none'
            });
            return;
          }
          
          // 计算距离和时间
          const distance = data.paths[0].distance || 0;
          const duration = Math.ceil((data.paths[0].duration || 0) / 60); // 转换为分钟
          
          // 保存原始路线点，用于后续导航更新
          this.originalPoints = [...points];
          
          // 更新地图数据
          this.setData({
            polyline: [{
              points: points,
              color: "#0091ff", // 使用官方示例的颜色
              width: 6,
              arrowLine: true
            }],
            distance: distance,
            duration: duration,
            formattedDistance: this.formatDistance(distance),
            // 使用includePoints来设置地图可视区域
            includePoints: [
              { latitude: startPoint.latitude, longitude: startPoint.longitude },
              { latitude: endPoint.latitude, longitude: endPoint.longitude }
            ],
            scale: 14 // 设置地图缩放级别，确保能看到整个路线
          });
          
          // 延迟一下再设置地图中心点，避免渲染问题
          setTimeout(() => {
            this.setData({
              latitude: startPoint.latitude,
              longitude: startPoint.longitude
            });
          }, 100);
          
          wx.hideLoading();
        },
        fail: (error) => {
          console.error('获取驾车路线失败:', error);
          wx.showToast({
            title: '获取路线失败',
            icon: 'none'
          });
          wx.hideLoading();
        },
        complete: () => {
          // 确保无论成功还是失败都关闭loading
          wx.hideLoading();
        }
      });
    } catch (err) {
      console.error('路线规划出错:', err);
      wx.showToast({
        title: '路线规划失败',
        icon: 'none'
      });
      wx.hideLoading();
    }
  },

  // 格式化距离
  formatDistance(distance) {
    if (distance < 1000) {
      return distance + 'm';
    } else {
      return (distance / 1000).toFixed(1) + 'km';
    }
  },

  // 开始导航
  startNavigation: function () {
    if (!this.data.endPoint) {
      wx.showToast({
        title: '请先选择目的地',
        icon: 'none'
      });
      return;
    }
    
    // 确保有路线数据，如果没有则重新获取
    if (!this.data.polyline || !this.data.polyline.length || !this.data.polyline[0].points || !this.data.polyline[0].points.length) {
      console.log('路线数据不存在，重新获取路线');
      this.getRoute();
      
      // 使用setTimeout等待路线获取完成
      setTimeout(() => {
        // 再次检查路线是否存在
        if (this.data.polyline && this.data.polyline.length && this.data.polyline[0].points && this.data.polyline[0].points.length) {
          this.setData({ isNavigating: true });
          this.startLocationUpdate();
        } else {
          wx.showToast({
            title: '路线获取失败，请重试',
            icon: 'none'
          });
        }
      }, 2000);
    } else {
      // 如果路线数据已存在，直接开始导航
      this.setData({ isNavigating: true });
      this.startLocationUpdate();
    }
  },
  
  // 开始实时定位更新
  startLocationUpdate: function() {
    if (this.locationTimer) {
      clearInterval(this.locationTimer);
    }
    
    // 确保原始路线点数据存在
    if (!this.originalPoints && this.data.polyline && this.data.polyline[0] && this.data.polyline[0].points) {
      this.originalPoints = [...this.data.polyline[0].points];
    }
    
    // 如果仍然没有路线数据，获取路线
    if (!this.originalPoints || this.originalPoints.length === 0) {
      console.warn('没有原始路线点数据，重新获取路线');
      this.getRoute();
      
      // 延迟后再次检查并启动导航
      setTimeout(() => {
        if (this.data.polyline && this.data.polyline[0] && this.data.polyline[0].points) {
          this.originalPoints = [...this.data.polyline[0].points];
          this.startRealTimeLocationUpdate();
        } else {
          wx.showToast({
            title: '导航初始化失败，请重试',
            icon: 'none'
          });
          this.setData({ isNavigating: false });
        }
      }, 2000);
    } else {
      // 已有路线数据，直接开始实时更新
      this.startRealTimeLocationUpdate();
    }
  },
  
  // 实际的实时位置更新功能
  startRealTimeLocationUpdate: function() {
    console.log('开始实时位置更新，路线点数量:', this.originalPoints ? this.originalPoints.length : 0);
    
    this.locationTimer = setInterval(() => {
      wx.getLocation({
        type: 'gcj02',
        success: (res) => {
          const { latitude, longitude } = res;
          
          // 确保latitude和longitude是数值类型
          const lat = parseFloat(latitude);
          const lng = parseFloat(longitude);
          
          if (isNaN(lat) || isNaN(lng)) {
            console.error('获取到无效的位置数据');
            return;
          }
          
          // 判断是否已经到达终点附近 (50米范围内)
          const arrived = this.calculateDistance(
            lat, lng, 
            parseFloat(this.data.endPoint.latitude), parseFloat(this.data.endPoint.longitude)
          ) < 50;
          
          // 创建新的标记点数组
          const markers = [];
          
          // 添加当前位置标记
          markers.push({
            id: 0,
            latitude: lat,
            longitude: lng,
            width: 30,
            height: 30,
            iconPath: '../../images/location.png',
            callout: {
              content: '当前位置',
              color: '#000000',
              fontSize: 12,
              borderWidth: 1,
              borderColor: '#cccccc',
              borderRadius: 5,
              padding: 5,
              display: 'ALWAYS'
            }
          });
          
          // 确保终点标记存在
          if (this.data.endPoint) {
            markers.push({
              id: 1,
              latitude: parseFloat(this.data.endPoint.latitude),
              longitude: parseFloat(this.data.endPoint.longitude),
              width: 30,
              height: 30,
              iconPath: '../../images/destination.png',
              callout: {
                content: this.data.endPoint.name || '目的地',
                color: '#000000',
                fontSize: 12,
                borderWidth: 1,
                borderColor: '#cccccc',
                borderRadius: 5,
                padding: 5,
                display: 'ALWAYS'
              }
            });
          }
          
          // 处理路线点的更新逻辑
          if (this.originalPoints && this.originalPoints.length > 0) {
            let minDistance = Number.MAX_VALUE;
            let closestPointIndex = 0;
            
            // 找到距离当前位置最近的路线点
            for (let i = 0; i < this.originalPoints.length; i++) {
              const point = this.originalPoints[i];
              const distance = this.calculateDistance(
                lat, lng, 
                parseFloat(point.latitude), parseFloat(point.longitude)
              );
              
              if (distance < minDistance) {
                minDistance = distance;
                closestPointIndex = i;
              }
            }
            
            // 从最近的点开始，创建新的路线
            const remainingPoints = this.originalPoints.slice(closestPointIndex);
            
            // 确保所有点都有有效坐标
            const validPoints = remainingPoints.filter(point => 
              !isNaN(parseFloat(point.latitude)) && !isNaN(parseFloat(point.longitude))
            );
            
            // 只有在有有效点的情况下才更新polyline
            if (validPoints.length > 0) {
              // 更新位置、标记和路线
              this.setData({ 
                latitude: lat, 
                longitude: lng,
                markers: markers,
                polyline: [{
                  points: validPoints,
                  color: '#0091ff',
                  width: 6,
                  arrowLine: true
                }]
              });
              
              // 更新剩余距离
              if (validPoints.length > 1) {
                // 计算剩余距离
                let remainingDistance = 0;
                for (let i = 0; i < validPoints.length - 1; i++) {
                  remainingDistance += this.calculateDistance(
                    parseFloat(validPoints[i].latitude), parseFloat(validPoints[i].longitude),
                    parseFloat(validPoints[i + 1].latitude), parseFloat(validPoints[i + 1].longitude)
                  );
                }
                
                this.setData({
                  distance: remainingDistance,
                  formattedDistance: this.formatDistance(remainingDistance)
                });
              }
            } else {
              // 如果没有有效的路线点，只更新位置和标记
              this.setData({ 
                latitude: lat, 
                longitude: lng,
                markers: markers
              });
            }
          } else {
            // 如果没有原始路线点，只更新位置和标记
            this.setData({ 
              latitude: lat, 
              longitude: lng,
              markers: markers
            });
          }
          
          // 到达终点提示
          if (arrived) {
            clearInterval(this.locationTimer);
            this.locationTimer = null;
            this.originalPoints = null;
            this.setData({ isNavigating: false });
            
            wx.showModal({
              title: '已到达目的地',
              content: `目的地: ${this.data.endPoint.name || ''}`,
              showCancel: false
            });
          }
        },
        fail: (error) => {
          console.error('获取位置失败:', error);
        }
      });
    }, 3000); // 每3秒更新一次位置
  },

  // 结束导航
  endNavigation: function () {
    if (this.locationTimer) {
      clearInterval(this.locationTimer);
      this.locationTimer = null;
    }
    
    this.originalPoints = null;
    this.setData({
      isNavigating: false
    });
    
    // 刷新当前位置
    this.getLocation();
  },

  // 计算两点间距离（单位：米）
  calculateDistance: function (lat1, lng1, lat2, lng2) {
    const radLat1 = lat1 * Math.PI / 180.0;
    const radLat2 = lat2 * Math.PI / 180.0;
    const a = radLat1 - radLat2;
    const b = lng1 * Math.PI / 180.0 - lng2 * Math.PI / 180.0;
    const s = 2 * Math.asin(Math.sqrt(Math.pow(Math.sin(a / 2), 2) +
      Math.cos(radLat1) * Math.cos(radLat2) * Math.pow(Math.sin(b / 2), 2)));
    const EARTH_RADIUS = 6378137.0; // 地球半径（单位：米）
    return Math.round(s * EARTH_RADIUS);
  },

  // 重新定位
  reLocate: function () {
    this.getLocation();
  },

  // ===== 道路预警功能 =====

  // 初始化低功耗蓝牙
  initBLE() {
    if (!app.globalData.isBLEAvailable) {
      wx.showToast({
        title: '蓝牙不可用',
        icon: 'none'
      });
      return;
    }

    // 开始搜索设备
    app.searchBLEDevices();
  },

  // 连接设备
  connectDevice(deviceId) {
    app.connectBLEDevice(deviceId);
    this.setData({
      isConnected: true,
      deviceId: deviceId
    });
  },

  // 断开连接
  disconnectDevice() {
    app.disconnectBLE();
    this.setData({
      isConnected: false,
      deviceId: null
    });
  },

  // 处理蓝牙数据
  handleBLEData(lane, speed, distance) {
    if (lane >= 0 && lane < 3) {
      const lanes = [...this.data.lanes];
      lanes[lane] = {
        showCar: true,
        speed: speed,
        distance: distance
      };
      this.setData({ lanes });

      // 3秒后隐藏车辆
      setTimeout(() => {
        const lanes = [...this.data.lanes];
        lanes[lane].showCar = false;
        this.setData({ lanes });
      }, 3000);
    }
  },
  
  // 模拟车辆数据（仅用于测试）
  simulateCarData() {
    this.simulationTimer = setInterval(() => {
      // 随机选择一个车道（0-2）
      const lane = Math.floor(Math.random() * 3);
      // 随机速度（30-120）
      const speed = Math.floor(Math.random() * 90) + 30;
      // 随机距离（10-1000）
      const distance = Math.floor(Math.random() * 990) + 10;
      
      // 调用处理函数
      this.handleBLEData(lane, speed, distance);
    }, 8000); // 每8秒模拟一次数据
  }
}); 