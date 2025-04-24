// pages/warning/warning.js
const app = getApp()

Page({
  data: {
    // 车道数据
    lanes: [
      { showCar: false, speed: 0, distance: 0 },
      { showCar: false, speed: 0, distance: 0 },
      { showCar: false, speed: 0, distance: 0 }
    ],
    // 蓝牙连接状态
    isConnected: false,
    deviceId: null
  },

  onLoad() {
    this.initBLE()
    
    // 模拟数据用于测试，实际应使用蓝牙数据
    this.simulateCarData()
  },

  onUnload() {
    // 页面卸载时断开蓝牙连接
    if (this.data.isConnected) {
      app.disconnectBLE()
    }
    
    // 清除定时器
    if (this.simulationTimer) {
      clearInterval(this.simulationTimer)
    }
  },

  // 初始化低功耗蓝牙
  initBLE() {
    if (!app.globalData.isBLEAvailable) {
      wx.showToast({
        title: '蓝牙不可用',
        icon: 'none'
      })
      return
    }

    // 开始搜索设备
    app.searchBLEDevices()
  },

  // 连接设备
  connectDevice(deviceId) {
    app.connectBLEDevice(deviceId)
    this.setData({
      isConnected: true,
      deviceId: deviceId
    })
  },

  // 断开连接
  disconnectDevice() {
    app.disconnectBLE()
    this.setData({
      isConnected: false,
      deviceId: null
    })
  },

  // 处理蓝牙数据
  handleBLEData(lane, speed, distance) {
    if (lane >= 0 && lane < 3) {
      const lanes = [...this.data.lanes]
      lanes[lane] = {
        showCar: true,
        speed: speed,
        distance: distance
      }
      this.setData({ lanes })

      // 3秒后隐藏车辆
      setTimeout(() => {
        const lanes = [...this.data.lanes]
        lanes[lane].showCar = false
        this.setData({ lanes })
      }, 3000)
    }
  },
  
  // 模拟车辆数据（仅用于测试）
  simulateCarData() {
    this.simulationTimer = setInterval(() => {
      // 随机选择一个车道（0-2）
      const lane = Math.floor(Math.random() * 3)
      // 随机速度（30-120）
      const speed = Math.floor(Math.random() * 90) + 30
      // 随机距离（10-1000）
      const distance = Math.floor(Math.random() * 990) + 10
      
      // 调用处理函数
      this.handleBLEData(lane, speed, distance)
    }, 8000) // 每8秒模拟一次数据
  }
})