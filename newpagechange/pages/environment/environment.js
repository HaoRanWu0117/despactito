// environment.js
const app = getApp();

Page({
  data: {
    envData: {
      hcho: '0.050',  // 甲醛：mg/m³
      o2: 20.9,       // 氧气：%
      co2: 400,       // 二氧化碳：ppm
      tvoc: '0.200'   // 总挥发性有机物：mg/m³
    },
    bodyData: {
      temperature: '36.5', // 体温(℃)
      oxygen: '98',        // 血氧(%)
      heartRate: '75',     // 心率(bpm)
      respRate: '16'       // 呼吸频率(次/分)
    },
    ranges: {
      hcho: { min: 0, max: 0.1, unit: 'mg/m³', description: '安全值 ≤ 0.1 mg/m³' },
      o2: { min: 19.5, max: 23.5, unit: '%', description: '安全范围 19.5% - 23.5%' },
      co2: { min: 350, max: 800, unit: 'ppm', description: '安全值 ≤ 800 ppm' },
      tvoc: { min: 0, max: 0.6, unit: 'mg/m³', description: '安全值 ≤ 0.6 mg/m³' }
    },
    bodyRanges: {
      temperature: { min: 36, max: 37.3, unit: '℃' },
      oxygen: { min: 95, max: 100, unit: '%' },
      heartRate: { min: 60, max: 100, unit: 'bpm' },
      respRate: { min: 12, max: 20, unit: '次/分' }
    },
    mqttConnectionStatus: false,
    warnings: {
      hcho: false,
      o2: false,
      co2: false,
      tvoc: false,
      temperature: false,  // 新增：跟踪体温预警
      oxygen: false,      // 新增：跟踪血氧预警
      heartRate: false,   // 新增：跟踪心率预警
      respRate: false     // 新增：跟踪呼吸频率预警
    },
    lastWarningTime: 0
  },

  onLoad: function () {
    this.updateEnvDataFromGlobal();
    this.updateBodyDataFromGlobal();
  },

  onShow: function() {
    this.checkMqttStatus();
    this.updateEnvDataFromGlobal();
    this.updateBodyDataFromGlobal();
    this.intervalId = setInterval(() => {
      this.checkMqttStatus();
      this.updateEnvDataFromGlobal();
      this.updateBodyDataFromGlobal();
    }, 5000);
  },

  onHide: function() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  },

  onUnload: function () {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  },

  checkMqttStatus: function() {
    this.setData({
      mqttConnectionStatus: app.globalData.mqttConnected
    });
  },

  updateEnvDataFromGlobal: function() {
    if (app.globalData.environmentData) {
      const envData = {
        hcho: parseFloat(app.globalData.environmentData.hcho).toFixed(3),
        o2: parseFloat(app.globalData.environmentData.o2).toFixed(1),
        co2: parseInt(app.globalData.environmentData.co2),
        tvoc: parseFloat(app.globalData.environmentData.tvoc).toFixed(3)
      };
      const warnings = { ...this.data.warnings };
      warnings.hcho = parseFloat(envData.hcho) > this.data.ranges.hcho.max;
      warnings.o2 = parseFloat(envData.o2) < this.data.ranges.o2.min || parseFloat(envData.o2) > this.data.ranges.o2.max;
      warnings.co2 = parseInt(envData.co2) > this.data.ranges.co2.max;
      warnings.tvoc = parseFloat(envData.tvoc) > this.data.ranges.tvoc.max;
      this.setData({
        envData: envData,
        warnings: warnings
      });
    }
  },

  updateBodyDataFromGlobal: function() {
    if (app.globalData.bodyData) {
      const bodyData = {
        temperature: parseFloat(app.globalData.bodyData.temperature).toFixed(1),
        oxygen: parseInt(app.globalData.bodyData.oxygen).toString(),
        heartRate: parseInt(app.globalData.bodyData.heartRate).toString(),
        respRate: parseInt(app.globalData.bodyData.respRate).toString()
      };
      const warnings = { ...this.data.warnings };
      const now = Date.now();
      // 检查体征数据异常
      warnings.temperature = parseFloat(bodyData.temperature) < this.data.bodyRanges.temperature.min || 
                            parseFloat(bodyData.temperature) > this.data.bodyRanges.temperature.max;
      warnings.oxygen = parseInt(bodyData.oxygen) < this.data.bodyRanges.oxygen.min || 
                        parseInt(bodyData.oxygen) > this.data.bodyRanges.oxygen.max;
      warnings.heartRate = parseInt(bodyData.heartRate) < this.data.bodyRanges.heartRate.min || 
                          parseInt(bodyData.heartRate) > this.data.bodyRanges.heartRate.max;
      warnings.respRate = parseInt(bodyData.respRate) < this.data.bodyRanges.respRate.min || 
                         parseInt(bodyData.respRate) > this.data.bodyRanges.respRate.max;
      // 触发异常预警
      if (warnings.temperature && now - this.data.lastWarningTime > 5000) {
        this.showWarning('体温', bodyData.temperature, this.data.bodyRanges.temperature);
        this.setData({ lastWarningTime: now });
      }
      if (warnings.oxygen && now - this.data.lastWarningTime > 5000) {
        this.showWarning('血氧', bodyData.oxygen, this.data.bodyRanges.oxygen);
        this.setData({ lastWarningTime: now });
      }
      if (warnings.heartRate && now - this.data.lastWarningTime > 5000) {
        this.showWarning('心率', bodyData.heartRate, this.data.bodyRanges.heartRate);
        this.setData({ lastWarningTime: now });
      }
      if (warnings.respRate && now - this.data.lastWarningTime > 5000) {
        this.showWarning('呼吸频率', bodyData.respRate, this.data.bodyRanges.respRate);
        this.setData({ lastWarningTime: now });
      }
      this.setData({
        bodyData: bodyData,
        warnings: warnings
      });
    }
  },

  handleMQTTData: function (e) {
    try {
      const message = e.detail.message;
      const data = JSON.parse(message);
      const now = Date.now();
      let needUpdate = false;

      // 环境数据处理（保持不变）
      const newEnvData = { ...this.data.envData };
      let newWarnings = { ...this.data.warnings };
      if (data.hcho !== undefined) {
        const value = parseFloat(data.hcho);
        newEnvData.hcho = value.toFixed(3);
        newWarnings.hcho = value > this.data.ranges.hcho.max;
        
        needUpdate = true;
      }
      if (data.o2 !== undefined) {
        const value = parseFloat(data.o2);
        newEnvData.o2 = value.toFixed(1);
        newWarnings.o2 = value < this.data.ranges.o2.min || value > this.data.ranges.o2.max;
        
        needUpdate = true;
      }
      if (data.co2 !== undefined) {
        const value = parseInt(data.co2);
        newEnvData.co2 = value;
        newWarnings.co2 = value > this.data.ranges.co2.max;
       
        needUpdate = true;
      }
      if (data.tvoc !== undefined) {
        const value = parseFloat(data.tvoc);
        newEnvData.tvoc = value.toFixed(3);
        newWarnings.tvoc = value > this.data.ranges.tvoc.max;
       
        needUpdate = true;
      }

      // 新增：体征数据处理
      const newBodyData = { ...this.data.bodyData };
      if (data.body_temp !== undefined) {
        const value = parseFloat(data.body_temp);
        newBodyData.temperature = value.toFixed(1);
        newWarnings.temperature = value < this.data.bodyRanges.temperature.min || value > this.data.bodyRanges.temperature.max;
        
        needUpdate = true;
      }
      if (data.blood_oxygen !== undefined) {
        const value = parseInt(data.blood_oxygen);
        newBodyData.oxygen = value.toString();
        newWarnings.oxygen = value < this.data.bodyRanges.oxygen.min || value > this.data.bodyRanges.oxygen.max;
        
        needUpdate = true;
      }
      if (data.heart_rate !== undefined) {
        const value = parseInt(data.heart_rate);
        newBodyData.heartRate = value.toString();
        newWarnings.heartRate = value < this.data.bodyRanges.heartRate.min || value > this.data.bodyRanges.heartRate.max;
      
        needUpdate = true;
      }
      if (data.respiration_rate !== undefined) {
        const value = parseInt(data.respiration_rate);
        newBodyData.respRate = value.toString();
        newWarnings.respRate = value < this.data.bodyRanges.respRate.min || value > this.data.bodyRanges.respRate.max;
        
        needUpdate = true;
      }

      if (needUpdate) {
        this.setData({
          envData: newEnvData,
          bodyData: newBodyData,
          warnings: newWarnings
        });
      }
    } catch (error) {
      console.error('解析MQTT数据错误:', error);
    }
  },

  getProgressPercent: function (type, value) {
    const range = this.data.ranges[type] || this.data.bodyRanges[type];
    let percent;
    if (type === 'o2' || type === 'oxygen' || type === 'temperature' || type === 'heartRate' || type === 'respRate') {
      const fullRange = range.max - range.min;
      percent = ((value - range.min) / fullRange) * 100;
    } else {
      percent = (value / range.max) * 100;
    }
    percent = Math.max(0, Math.min(100, percent));
    return percent + '%';
  }
});