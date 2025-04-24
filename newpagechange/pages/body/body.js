const app = getApp();

Page({
  /**
   * 页面的初始数据
   */
  data: {
    // 体征数据
    bodyData: {
      temperature: '36.5', // 体温(℃)
      oxygen: '98',        // 血氧(%)
      heartRate: '75',     // 心率(bpm)
      respRate: '16'       // 呼吸频率(次/分)
    },
    // 各项指标的正常范围
    ranges: {
      temperature: { min: 36, max: 37.3, unit: '℃' },
      oxygen: { min: 95, max: 100, unit: '%' },
      heartRate: { min: 60, max: 100, unit: 'bpm' },
      respRate: { min: 12, max: 20, unit: '次/分' }
    },
    // 连接状态
    isConnected: false,
    // MQTT配置
    mqttConfig: {},
    // 主题是否已更改
    topicChanged: false,
    // 新主题
    newTopic: ''
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    // 初始化界面 - 从全局获取数据
    this.updateBodyDataFromGlobal();
    // 获取MQTT配置
    this.setData({
      mqttConfig: app.globalData.mqttConfig,
      newTopic: app.globalData.mqttConfig.subTopic
    });
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {
    // 检查MQTT连接状态
    this.checkMqttStatus();
    
    // 从全局获取最新身体数据
    this.updateBodyDataFromGlobal();
    
    // 定时更新状态和数据 - 每5秒一次
    this.intervalId = setInterval(() => {
      this.checkMqttStatus();
      this.updateBodyDataFromGlobal();
    }, 5000);
  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide: function () {
    // 停止自动更新定时器
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload: function () {
    // 停止自动更新定时器
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  },

  /**
   * 检查MQTT连接状态
   */
  checkMqttStatus: function() {
    this.setData({
      isConnected: app.globalData.mqttConnected
    });
  },
  
  /**
   * 从全局更新身体数据
   */
  updateBodyDataFromGlobal: function() {
    if (app.globalData.bodyData) {
      this.setData({
        bodyData: app.globalData.bodyData
      });
    }
  },
  
  /**
   * 处理MQTT数据
   */
  handleMQTTData: function(e) {
    try {
      const message = e.detail.message;
      const data = JSON.parse(message);
      
      // 只更新有值的属性
      let newBodyData = { ...this.data.bodyData };
      
      if (data.body_temp !== undefined) {
        newBodyData.temperature = parseFloat(data.body_temp).toFixed(1);
      }
      
      if (data.blood_oxygen !== undefined) {
        newBodyData.oxygen = data.blood_oxygen.toString();
      }
      
      if (data.heart_rate !== undefined) {
        newBodyData.heartRate = data.heart_rate.toString();
      }
      
      if (data.respiration_rate !== undefined) {
        newBodyData.respRate = data.respiration_rate.toString();
      }
      
      this.setData({
        bodyData: newBodyData
      });
      
    } catch (error) {
      console.error('解析MQTT数据错误:', error);
    }
  },

  /**
   * 判断指标值是否异常
   */
  /**
 * 判断指标值是否异常
 */
isAbnormal: function (type, value) {
  // 对于体温，当超过36℃时显示红色
  if (type === 'temperature') {
    // 首先确保转换为数字
    const tempValue = parseFloat(value);
    console.log('体温值:', value, '转换后:', tempValue, '是否大于36:', tempValue > 36);
    return tempValue > 36;
  }
  
  // 转为数字进行比较
  const numValue = parseFloat(value);
  const range = this.data.ranges[type];
  
  // 其他指标保持原有逻辑：若值不是数字或超出范围则视为异常
  return isNaN(numValue) || numValue < range.min || numValue > range.max;
},

  /**
   * 切换MQTT连接状态
   */
  toggleMqttConnection: function(e) {
    const isChecked = e.detail.value;
    
    if (isChecked) {
      // 连接MQTT
      app.connectMqtt();
      
      wx.showToast({
        title: '正在连接...',
        icon: 'loading',
        duration: 1500
      });
    } else {
      // 断开MQTT
      app.disconnectMqtt();
      
      wx.showToast({
        title: '已断开连接',
        icon: 'success',
        duration: 1500
      });
      
      // 立即更新状态
      this.checkMqttStatus();
    }
  },

  /**
   * 处理主题输入变化
   */
  onTopicInput: function(e) {
    const newValue = e.detail.value;
    
    // 检查是否与当前主题不同
    if (newValue !== this.data.mqttConfig.subTopic) {
      this.setData({
        topicChanged: true,
        newTopic: newValue
      });
    } else {
      this.setData({
        topicChanged: false,
        newTopic: newValue
      });
    }
  },

  /**
   * 更新订阅主题
   */
  updateSubscription: function() {
    const newTopic = this.data.newTopic;
    
    // 检查主题是否为空
    if (!newTopic || newTopic.trim() === '') {
      wx.showToast({
        title: '主题不能为空',
        icon: 'error',
        duration: 1500
      });
      return;
    }
    
    // 保存新主题到全局配置
    app.globalData.mqttConfig.subTopic = newTopic;
    
    // 更新本地显示
    this.setData({
      'mqttConfig.subTopic': newTopic,
      topicChanged: false
    });
    
    // 如果已连接，则需要重新订阅
    if (this.data.isConnected) {
      // 断开当前连接
      app.disconnectMqtt();
      
      // 重新连接 (会使用新的主题订阅)
      app.connectMqtt();
      
      wx.showToast({
        title: '已更新订阅',
        icon: 'success',
        duration: 1500
      });
    } else {
      wx.showToast({
        title: '主题已保存',
        icon: 'success',
        duration: 1500
      });
    }
  }
}) 