const app = getApp();

Page({
  data: {
    envData: {
      hcho: 0.05,  // 甲醛：mg/m³
      o2: 20.9,    // 氧气：%
      co2: 400,    // 二氧化碳：ppm
      tvoc: 0.2,   // 总挥发性有机物：mg/m³
    },
    // 体征数据
    bodyData: {
      temperature: '36.5', // 体温(℃)
      oxygen: '98',        // 血氧(%)
      heartRate: '75',     // 心率(bpm)
      respRate: '16'       // 呼吸频率(次/分)
    },
    ranges: {
      hcho: {
        min: 0,
        max: 0.1,
        unit: 'mg/m³',
        description: '安全值 ≤ 0.1 mg/m³'
      },
      o2: {
        min: 19.5,
        max: 23.5,
        unit: '%',
        description: '安全范围 19.5% - 23.5%'
      },
      co2: {
        min: 350,
        max: 1000,
        unit: 'ppm',
        description: '安全值 ≤ 1000 ppm'
      },
      tvoc: {
        min: 0,
        max: 0.6,
        unit: 'mg/m³',
        description: '安全值 ≤ 0.6 mg/m³'
      }
    },
    // 体征指标的正常范围
    bodyRanges: {
      temperature: { min: 36, max: 37.3, unit: '℃' },
      oxygen: { min: 95, max: 100, unit: '%' },
      heartRate: { min: 60, max: 100, unit: 'bpm' },
      respRate: { min: 12, max: 20, unit: '次/分' }
    },
    mqttConnectionStatus: false
  },

  onLoad: function () {
    // 初始化数据
    this.updateEnvDataFromGlobal();
    this.updateBodyDataFromGlobal();
  },

  onShow: function() {
    // 检查MQTT连接状态
    this.checkMqttStatus();
    
    // 从全局获取最新环境数据
    this.updateEnvDataFromGlobal();
    // 从全局获取最新体征数据
    this.updateBodyDataFromGlobal();
    
    // 定时更新状态和数据 - 每5秒一次
    this.intervalId = setInterval(() => {
      this.checkMqttStatus();
      this.updateEnvDataFromGlobal();
      this.updateBodyDataFromGlobal();
    }, 5000);
  },
  
  onHide: function() {
    // 清除定时器
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  },

  onUnload: function () {
    // 清除定时器
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  },
  
  // 检查MQTT连接状态
  checkMqttStatus: function() {
    this.setData({
      mqttConnectionStatus: app.globalData.mqttConnected
    });
  },
  
  // 从全局更新环境数据
  updateEnvDataFromGlobal: function() {
    if (app.globalData.environmentData) {
      this.setData({
        envData: app.globalData.environmentData
      });
    }
  },
  
  // 从全局更新体征数据
  updateBodyDataFromGlobal: function() {
    if (app.globalData.bodyData) {
      this.setData({
        bodyData: app.globalData.bodyData
      });
    }
  },

  // 处理MQTT接收到的数据
  handleMQTTData: function (e) {
    try {
      const message = e.detail.message;
      const data = JSON.parse(message);
      
      // 更新本地环境数据
      const newEnvData = {
        hcho: data.hcho !== undefined ? parseFloat(data.hcho) : this.data.envData.hcho,
        o2: data.o2 !== undefined ? parseFloat(parseFloat(data.o2).toFixed(1)) : this.data.envData.o2,
        co2: data.co2 !== undefined ? parseInt(data.co2) : this.data.envData.co2,
        tvoc: data.tvoc !== undefined ? parseFloat(data.tvoc) : this.data.envData.tvoc
      };
      
      this.setData({
        envData: newEnvData
      });
    } catch (error) {
      console.error('解析MQTT数据错误:', error);
    }
  },

  // 判断数值是否异常
  isAbnormal: function (type, value) {
    const range = this.data.ranges[type];
    
    if (type === 'o2') {
      return value < range.min || value > range.max;
    } else {
      return value > range.max;
    }
  },
  
  // 判断体征指标值是否异常
  isBodyAbnormal: function (type, value) {
    // 转为数字进行比较
    const numValue = parseFloat(value);
    const range = this.data.bodyRanges[type];
    
    // 若值不是数字或超出范围则视为异常
    return isNaN(numValue) || numValue < range.min || numValue > range.max;
  },

  // 计算进度条百分比
  getProgressPercent: function (type, value) {
    const range = this.data.ranges[type];
    let percent;
    
    if (type === 'o2') {
      // 对于氧气，进度是在正常范围内的位置
      const fullRange = range.max - range.min;
      percent = ((value - range.min) / fullRange) * 100;
    } else {
      // 对于有害气体，进度是相对最大安全值的比例
      percent = (value / range.max) * 100;
    }
    
    // 约束百分比在0-100之间
    percent = Math.max(0, Math.min(100, percent));
    return percent + '%';
  }
}) 