App({
  globalData: {
    userInfo: null,
    // MQTT相关
    mqttClient: null,
    mqttConnected: false,
    // MQTT配置
    mqttConfig: {
      host: "broker.emqx.io",
      port: 8084,
      subTopic: "/wechat_ros/sensor_data",
      username: "test",
      password: "test",
      reconnectPeriod: 1000, // 1000毫秒，设置为 0 禁用自动重连，两次重新连接之间的间隔时间
      connectTimeout: 30 * 1000, // 30秒，连接超时时间
    },
    // 数据存储
    bodyData: {
      temperature: '36.5', // 体温(℃)
      oxygen: '98',        // 血氧(%)
      heartRate: '75',     // 心率(bpm)
      respRate: '16'       // 呼吸频率(次/分)
    },
    environmentData: {
      hcho: 0.05,  // 甲醛：mg/m³
      o2: 20.9,    // 氧气：%
      co2: 400,    // 二氧化碳：ppm
      tvoc: 0.2,   // 总挥发性有机物：mg/m³
    }
  },
  
  onLaunch() {
    // 启动时连接MQTT
    this.connectMqtt();
  },
  
  onHide() {
    // 当小程序隐藏时断开MQTT
    this.disconnectMqtt();
  },
  
  // 连接MQTT服务器
  connectMqtt: function() {
    var that = this;
    var mqtt = require('./utils/mqtt.min.js');
    
    try {
      console.log('正在连接MQTT服务器...');
      const clientId = 'wx_' + Math.random().toString(16).substr(2, 8);
      const config = this.globalData.mqttConfig;
      
      // 连接MQTT服务器
      const client = mqtt.connect(`wxs://${config.host}:${config.port}/mqtt`, {
        username: config.username,
        password: config.password,
        reconnectPeriod: config.reconnectPeriod,
        connectTimeout: config.connectTimeout,
        clientId,
      });
      
      // 保存客户端实例
      this.globalData.mqttClient = client;
      
      // 连接成功回调
      client.on('connect', (e) => {
        console.log('MQTT服务器连接成功');
        that.globalData.mqttConnected = true;
        
        // 订阅主题
        client.subscribe(config.subTopic, {qos: 0}, function(err) {
          if (!err) {
            console.log('主题订阅成功:', config.subTopic);
            wx.showToast({
              title: '已连接MQTT',
              icon: 'success'
            });
          } else {
            console.error('主题订阅失败:', err);
            wx.showToast({
              title: '订阅失败',
              icon: 'error'
            });
          }
        });
      });
      
      // 接收消息回调
      client.on('message', function(topic, message) {
        console.log('收到消息:', topic, message.toString());
        var msg = message.toString();
        
        // 解析收到的消息并更新数据
        that.parseMessage(msg);
      });
      
      // 重连回调
      client.on('reconnect', (error) => {
        console.log('正在重连', error);
        that.globalData.mqttConnected = false;
      });
      
      // 错误回调
      client.on('error', (error) => {
        console.log('连接失败', error);
        that.globalData.mqttConnected = false;
        
        wx.showToast({
          title: '连接失败',
          icon: 'error'
        });
      });
      
      // 离线回调
      client.on('offline', () => {
        console.log('MQTT客户端离线');
        that.globalData.mqttConnected = false;
      });
      
    } catch (error) {
      console.error('MQTT连接错误:', error);
      that.globalData.mqttConnected = false;
      
      wx.showToast({
        title: '连接错误',
        icon: 'error'
      });
    }
  },

  // 解析MQTT消息
  parseMessage: function(message) {
    try {
      // 尝试将消息解析为JSON
      var data = JSON.parse(message);
      console.log('解析后的数据:', data);
      
      // 获取当前所有页面
      const pages = getCurrentPages();
      
      // 判断数据类型并更新相应的全局数据
      if (this.containsBodyData(data)) {
        // 更新身体数据
        this.updateBodyData(data);
        
        // 分发到body页面
        const bodyPage = pages.find(page => page.route === 'pages/body/body');
        if (bodyPage && bodyPage.handleMQTTData) {
          bodyPage.handleMQTTData({detail: {message: message}});
        }
      }
      
      if (this.containsEnvironmentData(data)) {
        // 更新环境数据
        this.updateEnvironmentData(data);
        
        // 分发到environment页面
        const envPage = pages.find(page => page.route === 'pages/environment/environment');
        if (envPage && envPage.handleMQTTData) {
          envPage.handleMQTTData({detail: {message: message}});
        }
      }
      
    } catch (e) {
      console.error('消息解析失败:', e);
    }
  },
  
  // 判断是否包含身体数据字段
  containsBodyData: function(data) {
    return data.heart_rate !== undefined || 
           data.blood_oxygen !== undefined || 
           data.respiration_rate !== undefined || 
           data.body_temp !== undefined;
  },
  
  // 判断是否包含环境数据字段
  containsEnvironmentData: function(data) {
    return data.tvoc !== undefined || 
           data.hcho !== undefined || 
           data.co2 !== undefined || 
           data.o2 !== undefined;
  },
  
  // 更新身体数据
  updateBodyData: function(data) {
    let bodyData = this.globalData.bodyData;
    
    // 更新数据，保留原有格式
    if (data.heart_rate !== undefined) bodyData.heartRate = data.heart_rate.toString();
    if (data.blood_oxygen !== undefined) bodyData.oxygen = data.blood_oxygen.toString();
    if (data.respiration_rate !== undefined) bodyData.respRate = data.respiration_rate.toString();
    if (data.body_temp !== undefined) bodyData.temperature = parseFloat(data.body_temp).toFixed(1);
    
    this.globalData.bodyData = bodyData;
  },
  
  // 更新环境数据
  updateEnvironmentData: function(data) {
    let envData = this.globalData.environmentData;
    
    if (data.tvoc !== undefined) envData.tvoc = parseFloat(data.tvoc);
    if (data.hcho !== undefined) envData.hcho = parseFloat(data.hcho);
    if (data.co2 !== undefined) envData.co2 = parseFloat(data.co2);
    if (data.o2 !== undefined) envData.o2 = parseFloat(parseFloat(data.o2).toFixed(1));
    
    this.globalData.environmentData = envData;
  },
  
  // 断开MQTT连接
  disconnectMqtt: function() {
    if (this.globalData.mqttClient) {
      this.globalData.mqttClient.end();
      this.globalData.mqttClient = null;
      this.globalData.mqttConnected = false;
      console.log('MQTT连接已断开');
    }
  },
  
  // 重新连接MQTT
  reconnectMqtt: function() {
    this.disconnectMqtt();
    this.connectMqtt();
  }
}) 