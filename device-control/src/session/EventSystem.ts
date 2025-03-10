import { generateId } from '../utils/helpers';

export type EventListener<T = any> = (data: T) => void;

export interface Subscription {
  id: string;
  eventName: string;
  listener: EventListener;
}

export class EventSystem {
  private subscriptions: Map<string, Subscription> = new Map();
  private eventListeners: Map<string, Set<string>> = new Map();

  constructor() {}

  subscribe<T = any>(eventName: string, listener: EventListener<T>): string {
    const subscriptionId = generateId();
    
    const subscription: Subscription = {
      id: subscriptionId,
      eventName,
      listener
    };
    
    this.subscriptions.set(subscriptionId, subscription);
    
    if (!this.eventListeners.has(eventName)) {
      this.eventListeners.set(eventName, new Set());
    }
    
    this.eventListeners.get(eventName)!.add(subscriptionId);
    
    return subscriptionId;
  }
  
  unsubscribe(subscriptionId: string): boolean {
    const subscription = this.subscriptions.get(subscriptionId);
    
    if (!subscription) {
      return false;
    }
    
    this.subscriptions.delete(subscriptionId);
    
    const eventListeners = this.eventListeners.get(subscription.eventName);
    if (eventListeners) {
      eventListeners.delete(subscriptionId);
      
      if (eventListeners.size === 0) {
        this.eventListeners.delete(subscription.eventName);
      }
    }
    
    return true;
  }
  
  publish<T = any>(eventName: string, data: T): void {
    const eventListeners = this.eventListeners.get(eventName);
    
    if (!eventListeners || eventListeners.size === 0) {
      return;
    }
    
    for (const subscriptionId of eventListeners) {
      const subscription = this.subscriptions.get(subscriptionId);
      if (subscription) {
        try {
          subscription.listener(data);
        } catch (error) {
          console.error(`Error in event listener for ${eventName}:`, error);
        }
      }
    }
  }
  
  clearListeners(eventName: string): void {
    const eventListeners = this.eventListeners.get(eventName);
    
    if (!eventListeners) {
      return;
    }
    
    for (const subscriptionId of eventListeners) {
      this.subscriptions.delete(subscriptionId);
    }
    
    this.eventListeners.delete(eventName);
  }
  
  clearAllListeners(): void {
    this.subscriptions.clear();
    this.eventListeners.clear();
  }
} 