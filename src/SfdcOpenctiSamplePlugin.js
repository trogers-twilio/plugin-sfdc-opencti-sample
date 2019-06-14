import { FlexPlugin } from 'flex-plugin';
import React from 'react';
import { isSalesForce, isSalesforceLightning } from './helpers/salesforce';
import { getOpenCTIScript } from './helpers/get-crm-script';
import { loadScript } from './helpers/load-script';

const PLUGIN_NAME = 'SfdcOpenctiSamplePlugin v0.20';

const softphonePanelWidthFull = 866;
const softphonePanelWidthHalf = 433;

const setSoftphonePanelWidth = (width) => {
  const sfApi = window.sforce.opencti;

  sfApi.setSoftphonePanelWidth({
    widthPX: width,
    callback: result => {
      if (result.success) {
        console.log(`Softphone panel width set to ${width}`);
      } else {
        console.error('Error setting softphone panel width.\r\n', result.errors);
      }
    },
  })
}

const saveSfdcLog = (value) => {
  const sfApi = window.sforce.opencti;

  sfApi.saveLog({
    value,
    callback: result => {
      if (result.success) {
        console.log('Updated record:', result.returnValue);
        sfApi.refreshView();
      } else {
        console.error('Error updating record.\r\n', result.errors);
      }
    }
  })
};

const getChatTranscript = (manager, channelSid) => {
  console.log('Getting chat transcript for channel SID', channelSid);
  const state = manager.store.getState();
  const flexState = state && state.flex;
  const chatChannels = flexState && flexState.chat && flexState.chat.channels;
  const taskChatChannel = chatChannels && chatChannels[channelSid];
  const chatMessages = taskChatChannel && taskChatChannel.messages;
  console.log(`Found ${chatMessages.length} messages for chat channel`);

  let chatTranscript = '';
  if (chatMessages && chatMessages.length > 0) {
    chatMessages.forEach(message => {
      const { authorName, body, timestamp } = message && message.source;
      chatTranscript += `${timestamp}\r\n`;
      chatTranscript += `${authorName}\r\n`;
      chatTranscript += `${body}\r\n`;
    });
  }

  return chatTranscript;
};

const showAgentDesktopPanel2 = (manager) => {
  manager.updateConfig({
    componentProps: {
      AgentDesktopView: {
        showPanel2: true
      }
    }
  });
};

const hideAgentDesktopPanel2 = (manager) => {
  manager.updateConfig({
    componentProps: {
      AgentDesktopView: {
        showPanel2: false
      }
    }
  });
};

export default class SfdcOpenctiSamplePlugin extends FlexPlugin {
  constructor() {
    super(PLUGIN_NAME);
  }

  /**
   * This code is run when your plugin is being started
   * Use this to modify any UI components or attach to the actions framework
   *
   * @param flex { typeof import('@twilio/flex-ui') }
   * @param manager { import('@twilio/flex-ui').Manager }
   */
  async init(flex, manager) {
    const sfdcBaseUrl = window.location.ancestorOrigins[0];

    if (!isSalesForce(sfdcBaseUrl)) {
      // Continue as usual
      console.warn('Not initializing Salesforce since this instance has been launched independently.');
      return;
    }

    if (!window.sforce) {
      console.warn('Open CTI not loaded. Loading Open CTI');
      const sfApiScript = getOpenCTIScript(sfdcBaseUrl);
      const sfApiUrl = `${sfdcBaseUrl}/support/api/44.0/${sfApiScript}`;

      await loadScript(sfApiUrl);
    }

    if (!window.sforce) {
      console.error('Salesforce Open CTI cannot be found');
      return;
    }

    flex.Actions.addListener('beforeAcceptTask', () => {
      setSoftphonePanelWidth(softphonePanelWidthFull);
      showAgentDesktopPanel2(manager);
    });
    flex.Actions.addListener('afterCompleteTask', () => {
      const state = manager.store.getState();
      const tasks = state.flex.worker.tasks;
      let allTasksComplete = true;
      tasks.forEach(task => {
        if (task.status !== 'completed') {
          allTasksComplete = false;
        }
      });
      if (allTasksComplete) {
        setSoftphonePanelWidth(softphonePanelWidthHalf);
        hideAgentDesktopPanel2(manager);
      }
    });

    flex.Actions.addListener('afterWrapupTask', payload => {
      const { task } = payload;
      const {
        attributes,
        taskChannelUniqueName,
      } = task;

      // Since this event can be fired for other types of tasks, it's good
      // practice to make sure your customization applies to this task
      if (taskChannelUniqueName === 'chat') {
        const chatTranscript = getChatTranscript(manager, attributes.channelSid);
        console.log('Chat Transcript:\r\n', chatTranscript);
        const sfdcTaskId = '00T3C000006ZpkHUAS';
        const sfdcLogValue = {
          Id: sfdcTaskId,
          Description: chatTranscript
        };
        saveSfdcLog(sfdcLogValue);
      }
    });
  }
}
