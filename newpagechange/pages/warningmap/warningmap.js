var AMapWX = require('../../libs/amap-wx.js');
const config = require('../../libs/config.js');
const app = getApp();

Page({
  data: {
    latitude: 23.099994,
    longitude: 113.324520,
    scale: 16,
    markers: [],
    polyline: [],
    isNavigating: false,
    startPoint: null,
    endPoint: null,
    distance: 0,
    duration: 0,
    formattedDistance: '0m',
    includePoints: [],
    lanes: [
      { showCar: true, speed: 0, distance: 0, overlayPulse: false }, // 左车道
      { showCar: false, speed: 0, distance: 0, overlayPulse: false }, // 中间车道
      { showCar: false, speed: 0, distance: 0, overlayPulse: false } // 右车道
    ],
    isConnected: false,
    deviceId: null
  },

  onLoad: function (options) {
    if (!config || !config.Config || !config.Config.key) {
      console.error('高德地图API Key配置异常，请检查config.js');
      wx.showToast({
        title: 'API Key配置错误',
        icon: 'none',
        duration: 2000
      });
      return;
    }
    
    this.getLocation();
    // 初始化车道状态
    this.updateLanesFromGlobal();
  },

  onShow: function () {
    if (!this.data.isNavigating) {
      this.getLocation();
    }
    // 页面显示时更新车道状态
    this.updateLanesFromGlobal();
  },
  
  onHide: function() {
    // Ensure no loading state is left hanging
    wx.hideLoading();
  },
  
  onUnload: function() {
    if (this.locationTimer) {
      clearInterval(this.locationTimer);
    }
    if (this.simulationTimer) {
      clearInterval(this.simulationTimer);
    }
    if (this.data.isConnected) {
      app.disconnectBLE();
    }
    wx.hideLoading();
  },

  // 处理预警数据
  handleWarningData: function (e) {
    const { warningData } = e.detail;
    const lanes = [...this.data.lanes];
    lanes[0].overlayPulse = warningData.left === 1;
    lanes[1].overlayPulse = warningData.middle === 1;
    lanes[2].overlayPulse = warningData.right === 1;
    this.setData({ lanes });
  },

  // 从全局数据更新车道状态
  updateLanesFromGlobal: function () {
    const warningData = app.globalData.warningData;
    const lanes = [...this.data.lanes];
    lanes[0].overlayPulse = warningData.left === 1;
    lanes[1].overlayPulse = warningData.middle === 1;
    lanes[2].overlayPulse = warningData.right === 1;
    this.setData({ lanes });
  },

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
          
          if (isNaN(latitude) || isNaN(longitude)) {
            console.error('无效的定位数据:', res);
            wx.showToast({
              title: '定位数据无效',
              icon: 'none'
            });
            return;
          }

          const currentMarker = {
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
          };

          this.setData({
            markers: [currentMarker],
            startPoint: { latitude, longitude },
            latitude, // Keep for map centering
            longitude
          });
        },
        fail: (error) => {
          console.error('获取位置失败:', error);
          wx.showToast({
            title: '获取位置失败',
            icon: 'none'
          });
        },
        complete: () => {
          wx.hideLoading();
        }
      });
    } catch (error) {
      console.error('getLocation发生错误:', error);
      wx.showToast({
        title: '定位错误',
        icon: 'none'
      });
      wx.hideLoading();
    }
  },

  chooseLocation: function () {
    wx.chooseLocation({
      success: (res) => {
        const { latitude, longitude, name, address } = res;
        const lat = parseFloat(latitude.toFixed(6));
        const lng = parseFloat(longitude.toFixed(6));
        
        if (isNaN(lat) || isNaN(lng)) {
          wx.showToast({
            title: '位置信息无效',
            icon: 'none'
          });
          return;
        }
        
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
        
        // Keep existing marker for current location (id: 0)
        const currentMarkers = this.data.markers.filter(marker => marker.id === 0);
        
        this.setData({
          endPoint: {
            latitude: lat,
            longitude: lng,
            name,
            address
          },
          markers: [...currentMarkers, destinationMarker]
        });
        
        this.getRoute();
      },
      fail: (error) => {
        console.error('选择位置失败:', error);
        wx.showToast({
          title: '选择位置失败',
          icon: 'none'
        });
      }
    });
  },
  
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
      const origin = `${startPoint.longitude},${startPoint.latitude}`;
      const destination = `${endPoint.longitude},${endPoint.latitude}`;
      
      console.log('规划路线 - 起点:', origin);
      console.log('规划路线 - 终点:', destination);
      
      const myAmapFun = new AMapWX({
        key: config.Config.key
      });
      
      myAmapFun.getRidingRoute({
        origin: origin,
        destination: destination,
        success: (data) => {
          console.log('骑行路线数据:', data);
          
          if (!data.paths || !data.paths[0]) {
            console.error('未返回有效的路线数据');
            wx.showToast({
              title: '未找到合适的骑行路线',
              icon: 'none'
            });
            return;
          }
          
          const points = [];
          if (data.paths && data.paths[0] && data.paths[0].rides) {
            const rides = data.paths[0].rides;
            for (let i = 0; i < rides.length; i++) {
              if (rides[i].polyline) {
                const polyline = rides[i].polyline.split(';');
                for (let j = 0; j < polyline.length; j++) {
                  const point = polyline[j].split(',');
                  const lng = parseFloat(point[0]);
                  const lat = parseFloat(point[1]);
                  if (!isNaN(lng) && !isNaN(lat)) {
                    points.push({ longitude: lng, latitude: lat });
                  }
                }
              }
            }
          }
          
          console.log('路线点数量:', points.length);
          
          if (points.length === 0) {
            wx.showToast({
              title: '路线点数据为空',
              icon: 'none'
            });
            return;
          }
          
          const distance = data.paths[0].distance || 0;
          const duration = Math.ceil((data.paths[0].duration || 0) / 60);
          
          this.originalPoints = [...points];
          
          this.setData({
            polyline: [{
              points: points,
              color: "#0091ff",
              width: 6,
              arrowLine: true
            }],
            distance: distance,
            duration: duration,
            formattedDistance: this.formatDistance(distance),
            includePoints: [
              { latitude: startPoint.latitude, longitude: startPoint.longitude },
              { latitude: endPoint.latitude, longitude: endPoint.longitude }
            ],
            scale: 16
          });
        },
        fail: (error) => {
          console.error('获取骑行路线失败:', error);
          wx.showToast({
            title: '获取路线失败',
            icon: 'none'
          });
        },
        complete: () => {
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

  formatDistance(distance) {
    if (distance < 1000) {
      return distance + 'm';
    } else {
      return (distance / 1000).toFixed(1) + 'km';
    }
  },

  startNavigation: function () {
    if (!this.data.endPoint) {
      wx.showToast({
        title: '请先选择目的地',
        icon: 'none'
      });
      return;
    }
    
    if (!this.data.polyline || !this.data.polyline.length || !this.data.polyline[0].points || !this.data.polyline[0].points.length) {
      console.log('路线数据不存在，重新获取路线');
      this.getRoute();
      
      setTimeout(() => {
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
      return;
    }
    
    this.setData({ isNavigating: true });
    this.startLocationUpdate();
  },
  
  startLocationUpdate: function() {
    if (this.locationTimer) {
      clearInterval(this.locationTimer);
    }
    
    if (!this.originalPoints && this.data.polyline && this.data.polyline[0] && this.data.polyline[0].points) {
      this.originalPoints = [...this.data.polyline[0].points];
    }
    
    if (!this.originalPoints || this.originalPoints.length === 0) {
      console.warn('没有原始路线点数据，重新获取路线');
      this.getRoute();
      
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
      return;
    }
    
    this.startRealTimeLocationUpdate();
  },
  
  startRealTimeLocationUpdate: function() {
    console.log('开始实时位置更新，路线点数量:', this.originalPoints ? this.originalPoints.length : 0);
    
    this.locationTimer = setInterval(() => {
      wx.getLocation({
        type: 'gcj02',
        success: (res) => {
          const { latitude, longitude } = res;
          const lat = parseFloat(latitude.toFixed(6));
          const lng = parseFloat(longitude.toFixed(6));
          
          if (isNaN(lat) || isNaN(lng)) {
            console.error('获取到无效的位置数据:', res);
            return;
          }
          
          const arrived = this.calculateDistance(
            lat, lng, 
            parseFloat(this.data.endPoint.latitude), 
            parseFloat(this.data.endPoint.longitude)
          ) < 50;
          
          const markers = [
            {
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
            }
          ];
          
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
          
          if (this.originalPoints && this.originalPoints.length > 0) {
            let minDistance = Number.MAX_VALUE;
            let closestPointIndex = 0;
            
            for (let i = 0; i < this.originalPoints.length; i++) {
              const point = this.originalPoints[i];
              if (!point || isNaN(point.latitude) || isNaN(point.longitude)) {
                continue;
              }
              const distance = this.calculateDistance(
                lat, lng, 
                parseFloat(point.latitude), 
                parseFloat(point.longitude)
              );
              
              if (distance < minDistance) {
                minDistance = distance;
                closestPointIndex = i;
              }
            }
            
            const remainingPoints = this.originalPoints.slice(closestPointIndex).filter(point => 
              point && !isNaN(point.latitude) && !isNaN(point.longitude)
            );
            
            if (remainingPoints.length > 0) {
              let remainingDistance = 0;
              for (let i = 0; i < remainingPoints.length - 1; i++) {
                if (!remainingPoints[i] || !remainingPoints[i+1]) continue;
                remainingDistance += this.calculateDistance(
                  parseFloat(remainingPoints[i].latitude), 
                  parseFloat(remainingPoints[i].longitude),
                  parseFloat(remainingPoints[i + 1].latitude), 
                  parseFloat(remainingPoints[i + 1].longitude)
                );
              }
              
              this.setData({
                latitude: lat,
                longitude: lng,
                markers: markers.filter(marker => marker && !isNaN(marker.latitude) && !isNaN(marker.longitude)),
                polyline: [{
                  points: remainingPoints,
                  color: '#0091ff',
                  width: 6,
                  arrowLine: true
                }],
                distance: remainingDistance,
                formattedDistance: this.formatDistance(remainingDistance)
              });
            } else {
              this.setData({
                latitude: lat,
                longitude: lng,
                markers: markers.filter(marker => marker && !isNaN(marker.latitude) && !isNaN(marker.longitude))
              });
            }
          } else {
            this.setData({
              latitude: lat,
              longitude: lng,
              markers: markers.filter(marker => marker && !isNaN(marker.latitude) && !isNaN(marker.longitude))
            });
          }
          
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
    }, 3000);
  },

  endNavigation: function () {
    if (this.locationTimer) {
      clearInterval(this.locationTimer);
      this.locationTimer = null;
    }
    
    this.originalPoints = null;
    this.setData({
      isNavigating: false
    });
    
    this.getLocation();
  },

  calculateDistance: function (lat1, lng1, lat2, lng2) {
    if (isNaN(lat1) || isNaN(lng1) || isNaN(lat2) || isNaN(lng2)) {
      return 0;
    }
    const radLat1 = lat1 * Math.PI / 180.0;
    const radLat2 = lat2 * Math.PI / 180.0;
    const a = radLat1 - radLat2;
    const b = lng1 * Math.PI / 180.0 - lng2 * Math.PI / 180.0;
    const s = 2 * Math.asin(Math.sqrt(Math.pow(Math.sin(a / 2), 2) +
      Math.cos(radLat1) * Math.cos(radLat2) * Math.pow(Math.sin(b / 2), 2)));
    const EARTH_RADIUS = 6378137.0;
    return Math.round(s * EARTH_RADIUS);
  },

  reLocate: function () {
    this.getLocation();
  },

  simulateCarData() {
    if (this.simulationTimer) {
      clearInterval(this.simulationTimer);
    }
    // 移除模拟逻辑，实际预警由 MQTT 数据控制
  }
});