App({
  globalData: {
    mqttClient: null,
    mqttConnected: false,
    mqttConfig: {
      host: "v6980369.ala.dedicated.aliyun.emqxcloud.cn",
      port: 8084,
      sensorTopic: "/wechat_ros/sensor_data",
      warningTopic: "/wechat_ros/warning_data",
      username: "test",
      password: "test",
      reconnectPeriod: 3000,
      connectTimeout: 30 * 1000,
    },
    bodyData: {
      temperature: '36.5',
      oxygen: '98',
      heartRate: '75',
      respRate: '16'
    },
    environmentData: {
      hcho: 0.05,
      o2: 20.9,
      co2: 400,
      tvoc: 0.2,
    },
    warningData: {
      left: 0,
      middle: 0,
      right: 0
    }
  },

  onLaunch() {
    this.connectMqtt();
  },

  connectMqtt: function () {
    var that = this;
    var mqtt = require('./utils/mqtt.min.js');

    try {
      console.log('正在连接MQTT服务器...', this.globalData.mqttConfig);
      const clientId = 'wx_' + Math.random().toString(16).substr(2, 8);
      const config = this.globalData.mqttConfig;

      const connectUrl = `wxs://${config.host}:${config.port}/mqtt`;
      console.log('连接URL:', connectUrl);

      const client = mqtt.connect(connectUrl, {
        username: config.username,
        password: config.password,
        reconnectPeriod: config.reconnectPeriod,
        connectTimeout: config.connectTimeout,
        clientId,
        clean: true,
        protocolVersion: 4,
        protocol: 'wxs',
        wsOptions: {
          createWebSocket: function (url) {
            return wx.connectSocket({
              url: url,
              success: () => {
                console.log('WebSocket连接成功');
              },
              fail: (err) => {
                console.error('WebSocket连接失败:', err);
              }
            });
          }
        }
      });

      this.globalData.mqttClient = client;

      client.on('connect', (e) => {
        console.log('MQTT服务器连接成功');
        that.globalData.mqttConnected = true;

        // 订阅所有主题
        const topics = [config.sensorTopic, config.warningTopic];
        topics.forEach(topic => {
          client.subscribe(topic, { qos: 0 }, function (err) {
            if (!err) {
              console.log('主题订阅成功:', topic);
              wx.showToast({
                title: '已连接MQTT',
                icon: 'success'
              });
            } else {
              console.error('主题订阅失败:', topic, err);
              wx.showToast({
                title: '订阅失败',
                icon: 'error'
              });
            }
          });
        });
      });

      client.on('message', function (topic, message) {
        console.log('收到消息:', topic, message.toString());
        var msg = message.toString();
        that.parseMessage(topic, msg);
      });

      client.on('reconnect', (error) => {
        console.log('正在重连', error);
        that.globalData.mqttConnected = false;
      });

      client.on('error', (error) => {
        console.log('连接失败', error);
        that.globalData.mqttConnected = false;
        wx.showToast({
          title: '连接失败',
          icon: 'error'
        });
      });

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

  parseMessage: function (topic, message) {
    try {
      console.log('开始解析消息:', topic, message);
      var data = JSON.parse(message);
      console.log('解析后的数据:', data);

      const pages = getCurrentPages();

      if (topic === this.globalData.mqttConfig.sensorTopic) {
        if (this.containsBodyData(data)) {
          console.log('检测到身体数据:', data);
          this.updateBodyData(data);
          const bodyPage = pages.find(page => page.route === 'pages/body/body');
          if (bodyPage && bodyPage.handleMQTTData) {
            console.log('分发数据到body页面');
            bodyPage.handleMQTTData({ detail: { message: message } });
          }
        }

        if (this.containsEnvironmentData(data)) {
          console.log('检测到环境数据:', data);
          this.updateEnvironmentData(data);
          const envPage = pages.find(page => page.route === 'pages/environment/environment');
          if (envPage && envPage.handleMQTTData) {
            console.log('分发数据到environment页面');
            envPage.handleMQTTData({ detail: { message: message } });
          }
        }
      } else if (topic === this.globalData.mqttConfig.warningTopic) {
        if (this.containsWarningData(data)) {
          console.log('检测到预警数据:', data);
          this.updateWarningData(data);
          const warningPage = pages.find(page => page.route === 'pages/warningmap/warningmap');
          if (warningPage && warningPage.handleWarningData) {
            console.log('分发数据到warningmap页面');
            warningPage.handleWarningData({ detail: { warningData: data } });
          }
        }
      }
    } catch (e) {
      console.error('消息解析失败:', e);
      console.error('原始消息:', message);
    }
  },

  containsBodyData: function (data) {
    return data.heart_rate !== undefined ||
           data.blood_oxygen !== undefined ||
           data.respiration_rate !== undefined ||
           data.body_temp !== undefined ||
           data.hbp !== undefined ||
           data.dbp !== undefined;
  },

  containsEnvironmentData: function (data) {
    return data.tvoc !== undefined ||
           data.hcho !== undefined ||
           data.co2 !== undefined ||
           data.o2 !== undefined;
  },

  containsWarningData: function (data) {
    return data.left !== undefined ||
           data.middle !== undefined ||
           data.right !== undefined;
  },

  updateBodyData: function (data) {
    let bodyData = this.globalData.bodyData;
    let updated = false;

    if (data.heart_rate !== undefined) {
      bodyData.heartRate = data.heart_rate.toString();
      updated = true;
    }
    if (data.blood_oxygen !== undefined) {
      bodyData.oxygen = data.blood_oxygen.toString();
      updated = true;
    }
    if (data.respiration_rate !== undefined) {
      bodyData.respRate = data.respiration_rate.toString();
      updated = true;
    }
    if (data.body_temp !== undefined) {
      bodyData.temperature = parseFloat(data.body_temp).toFixed(1);
      updated = true;
    }

    if (updated) {
      this.globalData.bodyData = { ...bodyData };
      const pages = getCurrentPages();
      const bodyPage = pages.find(page => page.route === 'pages/body/body');
      if (bodyPage && !bodyPage.__hidden__) {
        bodyPage.updateBodyDataFromGlobal && bodyPage.updateBodyDataFromGlobal();
      }
    }
  },

  updateEnvironmentData: function (data) {
    let envData = this.globalData.environmentData;
    let updated = false;

    if (data.tvoc !== undefined) {
      envData.tvoc = parseFloat(data.tvoc).toFixed(3);
      updated = true;
    }
    if (data.hcho !== undefined) {
      envData.hcho = parseFloat(data.hcho).toFixed(3);
      updated = true;
    }
    if (data.co2 !== undefined) {
      envData.co2 = parseFloat(data.co2);
      updated = true;
    }
    if (data.o2 !== undefined) {
      envData.o2 = parseFloat(parseFloat(data.o2).toFixed(1));
      updated = true;
    }

    if (updated) {
      this.globalData.environmentData = envData;
      const pages = getCurrentPages();
      const envPage = pages.find(page => page.route === 'pages/environment/environment');
      if (envPage && !envPage.__hidden__) {
        envPage.updateEnvDataFromGlobal && envPage.updateEnvDataFromGlobal();
      }
    }
  },

  updateWarningData: function (data) {
    let warningData = this.globalData.warningData;
    let updated = false;

    if (data.left !== undefined) {
      warningData.left = data.left;
      updated = true;
    }
    if (data.middle !== undefined) {
      warningData.middle = data.middle;
      updated = true;
    }
    if (data.right !== undefined) {
      warningData.right = data.right;
      updated = true;
    }

    if (updated) {
      this.globalData.warningData = { ...warningData };
    }
  },

  disconnectMqtt: function () {
    if (this.globalData.mqttClient) {
      this.globalData.mqttClient.end();
      this.globalData.mqttClient = null;
      this.globalData.mqttConnected = false;
      console.log('MQTT连接已断开');
    }
  },

  reconnectMqtt: function () {
    this.disconnectMqtt();
    this.connectMqtt();
  }
});