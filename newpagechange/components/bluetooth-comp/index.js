function inArray(arr, key, val) {
  for (let i = 0; i < arr.length; i++) {
    if (arr[i][key] === val) {
      return i;
    }
  }
  return -1;
}

// 将字符串转为 ArrayBuffer
function str2ab(str) {
  let buf = new ArrayBuffer(str.length);
  let bufView = new Uint8Array(buf);
  for (var i = 0, strLen = str.length; i < strLen; i++) {
    bufView[i] = str.charCodeAt(i);
  }
  return buf;
}

// 将 ArrayBuffer 转为字符串
function ab2str(buffer) {
  return String.fromCharCode.apply(null, new Uint8Array(buffer));
}

// 蓝牙连接组件
Component({
  properties: {
    // 服务UUID，用于筛选设备
    serviceId: {
      type: String,
      value: ''
    },
    // 特征值UUID，用于数据读写
    characteristicId: {
      type: String,
      value: ''
    },
    // 自动连接上次的设备
    autoConnect: {
      type: Boolean,
      value: false
    }
  },

  data: {
    isConnected: false,
    isSearching: false,
    devices: [],
    deviceId: '',
    deviceName: '',
    message: '',
    selectedServiceId: '',
    selectedCharacteristicId: '',
    // 保存读取到的数据
    receivedData: null
  },

  lifetimes: {
    attached: function() {
      this.initBluetooth();
    },
    detached: function() {
      this.closeBluetoothAdapter();
    }
  },

  methods: {
    // 初始化蓝牙
    initBluetooth: function() {
      const self = this;
      
      wx.openBluetoothAdapter({
        success: (res) => {
          console.log('蓝牙适配器初始化成功:', res);
          self.setData({
            message: '蓝牙已初始化'
          });
          
          // 如果设置了自动连接，尝试连接上次的设备
          if (self.data.autoConnect) {
            const lastDeviceId = wx.getStorageSync('last_connected_device_id');
            const lastDeviceName = wx.getStorageSync('last_connected_device_name');
            
            if (lastDeviceId) {
              self.setData({
                deviceId: lastDeviceId,
                deviceName: lastDeviceName
              });
              
              self.connectToDevice(lastDeviceId);
            }
          }
        },
        fail: (err) => {
          console.error('蓝牙适配器初始化失败:', err);
          self.setData({
            message: '蓝牙初始化失败，请检查蓝牙是否开启'
          });
        }
      });
      
      // 监听蓝牙适配器状态变化
      wx.onBluetoothAdapterStateChange((res) => {
        if (!res.available) {
          self.setData({
            isConnected: false,
            isSearching: false,
            devices: [],
            message: '蓝牙适配器不可用'
          });
        }
      });
      
      // 监听蓝牙连接状态变化
      wx.onBLEConnectionStateChange((res) => {
        if (!res.connected && res.deviceId === self.data.deviceId) {
          self.setData({
            isConnected: false,
            message: '设备连接已断开'
          });
        }
      });
    },
    
    // 开始搜索蓝牙设备
    startBluetoothDevicesDiscovery: function() {
      const self = this;
      
      self.setData({
        isSearching: true,
        devices: [],
        message: '开始搜索设备...'
      });
      
      // 先获取本机蓝牙适配器状态
      wx.getBluetoothAdapterState({
        success: (res) => {
          if (res.discovering) {
            wx.stopBluetoothDevicesDiscovery({
              success: () => {
                self.startScan();
              }
            });
          } else {
            self.startScan();
          }
        },
        fail: (err) => {
          console.error('获取蓝牙适配器状态失败:', err);
          self.setData({
            isSearching: false,
            message: '获取蓝牙状态失败'
          });
        }
      });
    },
    
    // 开始扫描
    startScan: function() {
      const self = this;
      
      wx.startBluetoothDevicesDiscovery({
        allowDuplicatesKey: false,
        success: (res) => {
          console.log('开始搜索蓝牙设备:', res);
          
          // 监听新设备发现事件
          wx.onBluetoothDeviceFound((deviceRes) => {
            deviceRes.devices.forEach(device => {
              if (!device.name && !device.localName) {
                return;
              }
              
              // 检查设备是否已经在列表中
              const existIndex = self.data.devices.findIndex(item => item.deviceId === device.deviceId);
              if (existIndex === -1) {
                const newDevices = self.data.devices.concat([{
                  name: device.name || device.localName || '未知设备',
                  deviceId: device.deviceId,
                  RSSI: device.RSSI
                }]);
                
                self.setData({
                  devices: newDevices
                });
              }
            });
          });
          
          // 10秒后自动停止搜索
          setTimeout(() => {
            if (self.data.isSearching) {
              self.stopBluetoothDevicesDiscovery();
            }
          }, 10000);
        },
        fail: (err) => {
          console.error('搜索蓝牙设备失败:', err);
          self.setData({
            isSearching: false,
            message: '搜索设备失败:' + (err.errMsg || '未知错误')
          });
        }
      });
    },
    
    // 停止搜索蓝牙设备
    stopBluetoothDevicesDiscovery: function() {
      const self = this;
      
      wx.stopBluetoothDevicesDiscovery({
        success: (res) => {
          console.log('停止搜索蓝牙设备:', res);
          self.setData({
            isSearching: false,
            message: self.data.devices.length > 0 ? '已发现 ' + self.data.devices.length + ' 个设备' : '未发现设备'
          });
        },
        fail: (err) => {
          console.error('停止搜索蓝牙设备失败:', err);
          self.setData({
            isSearching: false
          });
        }
      });
    },
    
    // 连接BLE设备
    connectBLE: function(e) {
      const device = e.currentTarget.dataset.device;
      this.connectToDevice(device.deviceId, device.name);
    },
    
    // 连接到指定设备
    connectToDevice: function(deviceId, deviceName) {
      const self = this;
      
      // 停止搜索
      if (self.data.isSearching) {
        self.stopBluetoothDevicesDiscovery();
      }
      
      self.setData({
        message: '正在连接设备...',
        deviceId: deviceId,
        deviceName: deviceName || wx.getStorageSync('last_connected_device_name') || '未知设备'
      });
      
      // 创建蓝牙连接
      wx.createBLEConnection({
        deviceId: deviceId,
        timeout: 10000, // 超时时间10s
        success: (res) => {
          console.log('蓝牙连接成功:', res);
          
          // 保存设备信息到本地存储
          wx.setStorageSync('last_connected_device_id', deviceId);
          wx.setStorageSync('last_connected_device_name', self.data.deviceName);
          
          self.setData({
            isConnected: true,
            message: '设备连接成功，获取服务中...'
          });
          
          // 获取设备服务
          self.getBLEDeviceServices(deviceId);
        },
        fail: (err) => {
          console.error('蓝牙连接失败:', err);
          self.setData({
            message: '连接失败:' + (err.errMsg || '未知错误')
          });
        }
      });
    },
    
    // 获取设备的服务
    getBLEDeviceServices: function(deviceId) {
      const self = this;
      
      wx.getBLEDeviceServices({
        deviceId: deviceId,
        success: (res) => {
          console.log('设备服务列表:', res.services);
          
          let targetServiceId = self.properties.serviceId;
          
          // 如果未指定serviceId，使用第一个服务
          if (!targetServiceId && res.services.length > 0) {
            targetServiceId = res.services[0].uuid;
          }
          
          if (targetServiceId) {
            self.setData({
              selectedServiceId: targetServiceId,
              message: '获取特征值中...'
            });
            
            // 获取特定服务的特征值
            self.getBLEDeviceCharacteristics(deviceId, targetServiceId);
          } else {
            self.setData({
              message: '未找到可用服务'
            });
          }
        },
        fail: (err) => {
          console.error('获取设备服务失败:', err);
          self.setData({
            message: '获取服务失败'
          });
        }
      });
    },
    
    // 获取特定服务的特征值
    getBLEDeviceCharacteristics: function(deviceId, serviceId) {
      const self = this;
      
      wx.getBLEDeviceCharacteristics({
        deviceId: deviceId,
        serviceId: serviceId,
        success: (res) => {
          console.log('特征值列表:', res.characteristics);
          
          let targetCharacteristicId = self.properties.characteristicId;
          let notifyCharacteristic = null;
          
          // 寻找合适的特征值
          for (let i = 0; i < res.characteristics.length; i++) {
            const char = res.characteristics[i];
            
            // 如果指定了特征值ID，优先使用指定的
            if (targetCharacteristicId && char.uuid === targetCharacteristicId) {
              notifyCharacteristic = char;
              break;
            }
            
            // 否则找第一个支持notify或indicate的特征值
            if (!targetCharacteristicId && (char.properties.notify || char.properties.indicate)) {
              notifyCharacteristic = char;
              break;
            }
          }
          
          if (notifyCharacteristic) {
            targetCharacteristicId = notifyCharacteristic.uuid;
            
            self.setData({
              selectedCharacteristicId: targetCharacteristicId,
              message: '连接完成，启用数据通知中...'
            });
            
            // 启用特征值变化通知
            self.notifyBLECharacteristicValueChange(deviceId, serviceId, targetCharacteristicId);
          } else {
            self.setData({
              message: '未找到合适的特征值'
            });
          }
        },
        fail: (err) => {
          console.error('获取特征值失败:', err);
          self.setData({
            message: '获取特征值失败'
          });
        }
      });
    },
    
    // 启用特征值变化通知
    notifyBLECharacteristicValueChange: function(deviceId, serviceId, characteristicId) {
      const self = this;
      
      wx.notifyBLECharacteristicValueChange({
        deviceId: deviceId,
        serviceId: serviceId,
        characteristicId: characteristicId,
        state: true,
        success: (res) => {
          console.log('启用特征值通知成功:', res);
          self.setData({
            message: '设备已连接，等待数据...'
          });
          
          // 监听特征值变化事件
          wx.onBLECharacteristicValueChange((valueRes) => {
            // 处理接收到的数据
            const receivedBuffer = valueRes.value;
            const receivedArray = new Uint8Array(receivedBuffer);
            
            console.log('接收到数据:', receivedArray);
            
            // 处理接收到的数据
            self.processReceivedData(receivedArray);
          });
        },
        fail: (err) => {
          console.error('启用特征值通知失败:', err);
          self.setData({
            message: '启用数据通知失败'
          });
        }
      });
    },
    
    // 处理接收到的数据
    processReceivedData: function(dataArray) {
      // 这里处理接收到的数据
      // 将Uint8Array转换为对象数据
      try {
        // 简单示例：假设数据是JSON格式的文本
        const dataStr = String.fromCharCode.apply(null, dataArray);
        let dataObj = null;
        
        try {
          dataObj = JSON.parse(dataStr);
        } catch (e) {
          // 如果不是JSON格式，则作为普通数据处理
          dataObj = {
            rawData: Array.from(dataArray),
            text: dataStr
          };
        }
        
        this.setData({
          receivedData: dataObj,
          message: '接收到新数据'
        });
        
        // 触发数据接收事件
        this.triggerEvent('onDataReceived', dataObj);
      } catch (e) {
        console.error('处理数据失败:', e);
      }
    },
    
    // 向蓝牙设备发送数据
    sendData: function(data) {
      const self = this;
      
      if (!self.data.isConnected || !self.data.deviceId || !self.data.selectedServiceId || !self.data.selectedCharacteristicId) {
        return Promise.reject(new Error('蓝牙设备未连接'));
      }
      
      let buffer;
      
      // 如果是字符串，转换为ArrayBuffer
      if (typeof data === 'string') {
        buffer = new Uint8Array(data.length);
        for (let i = 0; i < data.length; i++) {
          buffer[i] = data.charCodeAt(i);
        }
      } else if (data instanceof ArrayBuffer) {
        buffer = data;
      } else if (data instanceof Object) {
        // 如果是对象，转换为JSON字符串
        const jsonStr = JSON.stringify(data);
        buffer = new Uint8Array(jsonStr.length);
        for (let i = 0; i < jsonStr.length; i++) {
          buffer[i] = jsonStr.charCodeAt(i);
        }
      } else {
        return Promise.reject(new Error('不支持的数据格式'));
      }
      
      return new Promise((resolve, reject) => {
        wx.writeBLECharacteristicValue({
          deviceId: self.data.deviceId,
          serviceId: self.data.selectedServiceId,
          characteristicId: self.data.selectedCharacteristicId,
          value: buffer.buffer,
          success: (res) => {
            console.log('发送数据成功:', res);
            resolve(res);
          },
          fail: (err) => {
            console.error('发送数据失败:', err);
            reject(err);
          }
        });
      });
    },
    
    // 断开BLE连接
    closeBLEConnection: function() {
      const self = this;
      
      if (self.data.deviceId) {
        wx.closeBLEConnection({
          deviceId: self.data.deviceId,
          success: (res) => {
            console.log('断开连接成功:', res);
            self.setData({
              isConnected: false,
              message: '设备已断开连接'
            });
          },
          fail: (err) => {
            console.error('断开连接失败:', err);
          }
        });
      }
    },
    
    // 关闭蓝牙适配器
    closeBluetoothAdapter: function() {
      wx.closeBluetoothAdapter({
        success: (res) => {
          console.log('关闭蓝牙适配器成功:', res);
        },
        fail: (err) => {
          console.error('关闭蓝牙适配器失败:', err);
        }
      });
    }
  }
}) 