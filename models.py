#!/usr/bin/env python

from google.appengine.ext import db
from datetime import datetime

MIN_DELAY = 10

REQUESTS_STEP = 10

class RequestDelay (db.Model):
  ip = db.StringProperty(required=True)
  current_delay = db.IntegerProperty(required=True)

class Request (db.Model):
  ip = db.StringProperty(required=True)
  page_crawled = db.StringProperty(required=True)
  last_request = db.DateTimeProperty(auto_now=True)
  avg_request_delay = db.FloatProperty(default=float(MIN_DELAY))
  num_of_requests = db.IntegerProperty(default=1)
  
  def is_allowed(self):
    
    delay = RequestDelay.gql("where ip='%s'" % self.ip).get()
    
    if delay is None:
      delay = RequestDelay(ip=self.ip, current_delay=MIN_DELAY, next_delay=2*MIN_DELAY)
      delay.save()
    
    delta = (datetime.now() - self.last_request).total_seconds()
    d = delay.current_delay - delta

    if d <= 0:
      self.avg_request_delay = self.avg_request_delay * self.num_of_requests + delta
      self.last_request = datetime.now()
      self.num_of_requests += 1
      self.avg_request_delay /= self.num_of_requests
      
      if self.num_of_requests > REQUESTS_STEP:
        if self.avg_request_delay < 1.5 * delay.current_delay:
          delay.current_delay *= 2
          delay.save()
        else:
          delay.current_delay = max(delay.current_delay / 2, MIN_DELAY)
        self.num_of_requests = 1
        delay.save()
        
      self.save()

    return d