#!/usr/bin/env python
#
# Copyright 2007 Google Inc.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#
import webapp2

from pycrawler import CrawlerHandler
from models import Request

from json import dumps

from google.appengine.api import memcache
from urlparse import urlsplit
from datetime import datetime, timedelta

URL_REGEX = "((?:http:[/][/])?(?:(?:(?:www\.)?[a-z]|[A-Z]|[0-9]|[/.]|[~])*)*)"
MAX_PAGE_DEPTH = 10
MAX_PAGES_TO_CRAWL = 40

class MainHandler(webapp2.RequestHandler):
    def get(self):
      self.redirect("/static/index.html")
      
class RESTHandler(webapp2.RequestHandler):
    def get(self, url):
      self.redirect("/static/index.html?url=" + url)      
        
class JsonHandler(webapp2.RequestHandler):
    def get(self, url):
      
      ip = self.request.remote_addr #to prevent abuses, only a request every minute is served
      
      request = Request.gql("where ip='%s'" % ip).get() #Look for request from the same IP address
      if not request is None:
        delta = request.is_allowed()
        
        if delta > 0: #too little time has passed from the previous request
          #self.error(408)   #Timeout Error
          self.response.set_status(408, "Your IP address has issued a request less than 1 min ago. Please wait %d seconds" % delta)
          return
      else:
        request = Request(ip=ip, page_crawled=url)
        request.save()
      
      self.response.headers['Content-Type'] = 'application/json'
      handler = CrawlerHandler()


      site_image = memcache.get(url)

      
      if site_image is None:
        home_page = handler.start_crawling(url, MAX_PAGE_DEPTH, MAX_PAGES_TO_CRAWL, 0.01)  #causes a little delay, but not too big (one 100th of a sec) 

        if home_page is None:
          self.error(400) #Bad Request
          return
        else:
          site_image = handler.page_graph(home_page)
          memcache.set(url, site_image)
      
      self.__responde(site_image) 

    def __responde(self, answer):
      #Set the headers ti enable cache. Results will be cacheable for 1 day. 
      #Shared caches will be enabled to store responses by setting 'public" Chache-Control header 
      self.response.headers['Cache-Control'] = "public"
      self.response.headers['Last-Modified'] = (datetime.today() - timedelta(weeks=52)).strftime('%H:%M:%S-%a/%d/%b/%Y')
      self.response.headers['Expires'] = (datetime.today() + timedelta(days=1)).strftime('%H:%M:%S-%a/%d/%b/%Y')
      
      if self.request.get('jsonpcallback'):         
        self.response.out.write('{}({})'.format(self.request.get('jsonpcallback'), dumps(answer)))
      elif self.request.get('callback'):         
        self.response.out.write('{}({})'.format(self.request.get('callback'), dumps(answer)))
      else:
        self.response.out.write(dumps(answer))
        
        
app = webapp2.WSGIApplication([
    ('/', MainHandler),
    ('/static/?', MainHandler),
    (r'/json/' + URL_REGEX, JsonHandler),
    (r'/visual/' + URL_REGEX, RESTHandler)
], debug=False)
